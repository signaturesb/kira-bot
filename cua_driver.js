// cua_driver.js — Computer Use Agent Driver v2
// ════════════════════════════════════════════════════════════════════════════
//
// ARCHITECTURE
// ────────────────────────────────────────────────────────────────────────────
//   1. Playwright headless pilote Chromium (lazy-load — optionnel sur Render)
//   2. Claude claude-haiku-4-5 (Computer Use) analyse screenshots → actions
//   3. Cache session cookies 12h → /data/cua_session.json
//   4. MFA: polling /data/centris_mfa.txt (écrit par sms-bridge LaunchAgent Mac)
//   5. Fallback gracieux si Playwright absent (Render sans browser)
//
// EXPORTS PUBLICS
// ────────────────────────────────────────────────────────────────────────────
//   CUA_AVAILABLE()           → bool — Playwright + SDK installés?
//   cuaGetCentrisPDF(num)     → Buffer PDF | null
//   cuaGetCentrisAnnexes(num) → [{ name, buffer }] | []
//   cuaDownloadAndEmail(...)  → { success, url, fallback }
//   clearCuaSession()         → void
//
// UTILISATION DANS bot.js
// ────────────────────────────────────────────────────────────────────────────
//   const { cuaGetCentrisPDF, cuaGetCentrisAnnexes, CUA_AVAILABLE } = require('./cua_driver');
//
//   if (CUA_AVAILABLE()) {
//     const pdf = await cuaGetCentrisPDF('22264330');
//     // pdf = Buffer | null
//   }
//
// DÉPENDANCES (optionnelles — bot tourne sans elles)
// ────────────────────────────────────────────────────────────────────────────
//   npm install playwright @anthropic-ai/sdk
//   npx playwright install chromium --with-deps
//
// ════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const DATA_DIR       = fs.existsSync('/data') ? '/data' : path.join(__dirname, '.cua_data');
const SESSION_FILE   = path.join(DATA_DIR, 'cua_session.json');
const MFA_FILE       = path.join(DATA_DIR, 'centris_mfa.txt');
const PDF_DIR        = path.join(DATA_DIR, 'cua_pdfs');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;  // 12h
const MAX_CUA_STEPS  = 30;                     // iterations max par tâche CUA
const MFA_TIMEOUT_MS = 90 * 1000;             // 90s attente SMS
const PAGE_TIMEOUT   = 30_000;                 // 30s navigation
const ACTION_DELAY   = 800;                    // ms entre actions CUA
const VIEWPORT       = { width: 1280, height: 900 };

// URLs Centris (2026)
const CENTRIS_BASE   = 'https://agent.centris.ca';
const MATRIX_BASE    = 'https://matrix.agent.centris.ca';

// Modèle CUA — Haiku 3.5 = rapide + économique pour Computer Use
// Opus réservé aux décisions business complexes (bot principal)
const CUA_MODEL      = 'claude-haiku-4-5';

// ─── LAZY DEPS ────────────────────────────────────────────────────────────────

let _playwright = null;
let _Anthropic   = null;
let _cuaAvail    = null;   // cache du check

/**
 * Tente de charger Playwright + SDK.
 * @throws Error descriptive si absent
 */
function requireDeps() {
  if (!_playwright) {
    try {
      _playwright = require('playwright');
    } catch {
      throw new Error(
        'Playwright non installé.\n' +
        'Fix: npm install playwright && npx playwright install chromium --with-deps'
      );
    }
  }
  if (!_Anthropic) {
    try {
      _Anthropic = require('@anthropic-ai/sdk');
    } catch {
      throw new Error('@anthropic-ai/sdk non installé. Fix: npm install @anthropic-ai/sdk');
    }
  }
  return { playwright: _playwright, Anthropic: _Anthropic };
}

/**
 * Retourne true si CUA disponible (sans throw).
 * Résultat mis en cache après le premier appel.
 */
function CUA_AVAILABLE() {
  if (_cuaAvail !== null) return _cuaAvail;
  try {
    require.resolve('playwright');
    require.resolve('@anthropic-ai/sdk');
    _cuaAvail = true;
  } catch {
    _cuaAvail = false;
  }
  return _cuaAvail;
}

// ─── INIT DOSSIERS ───────────────────────────────────────────────────────────

function ensureDirs() {
  [DATA_DIR, PDF_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

// ─── SESSION CENTRIS ─────────────────────────────────────────────────────────

function loadSession() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (!raw.ts || !raw.cookies) return null;
    if (Date.now() - raw.ts > SESSION_TTL_MS) {
      fs.unlinkSync(SESSION_FILE);
      return null;
    }
    return raw.cookies;
  } catch {
    return null;
  }
}

function saveSession(cookies) {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ ts: Date.now(), cookies }), 'utf8');
  } catch (e) {
    console.warn('[CUA] saveSession error:', e.message);
  }
}

function clearCuaSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
    _cuaAvail = null; // reset cache
  } catch {}
}

// ─── MFA — attendre code SMS ─────────────────────────────────────────────────

/**
 * Poll /data/centris_mfa.txt écrit par sms-bridge LaunchAgent Mac.
 * @param {number} timeoutMs
 * @returns {Promise<string|null>} code 4-8 chiffres ou null si timeout
 */
async function waitForMFACode(timeoutMs = MFA_TIMEOUT_MS) {
  const start = Date.now();
  // Nettoyer résidu éventuel avant d'attendre
  try { if (fs.existsSync(MFA_FILE)) fs.unlinkSync(MFA_FILE); } catch {}

  while (Date.now() - start < timeoutMs) {
    await sleep(2000);
    if (fs.existsSync(MFA_FILE)) {
      const code = fs.readFileSync(MFA_FILE, 'utf8').trim();
      if (/^\d{4,8}$/.test(code)) {
        try { fs.unlinkSync(MFA_FILE); } catch {}
        return code;
      }
    }
  }
  return null;
}

// ─── PLAYWRIGHT UTILS ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Prend un screenshot pleine page, retourne Buffer PNG.
 */
async function screenshot(page) {
  return page.screenshot({ type: 'png', fullPage: false });
}

/**
 * Vérifie si une page nécessite un re-login.
 */
function isLoginPage(url) {
  return /\/login|\/auth|\/signin|oauth|auth0/i.test(url);
}

// ─── LOGIN CENTRIS ────────────────────────────────────────────────────────────

/**
 * Ouvre une page Chromium authentifiée sur agent.centris.ca.
 * Utilise la session cachée si valide, sinon re-login complet.
 *
 * Stratégie login (Auth0 split form):
 *   Step 1 → identifiant (CENTRIS_USER = numéro courtier ex: 110509)
 *   Step 2 → mot de passe (CENTRIS_PASS)
 *   Step 3 → MFA SMS optionnel (sms-bridge LaunchAgent)
 *
 * @param {import('playwright').BrowserContext} context
 * @returns {Promise<import('playwright').Page>} page authentifiée
 */
async function loginCentris(context) {
  const user = process.env.CENTRIS_USER;
  const pass = process.env.CENTRIS_PASS;
  if (!user || !pass) {
    throw new Error('CENTRIS_USER / CENTRIS_PASS manquants dans env vars');
  }

  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  // ── Essai session cachée ──
  const cachedCookies = loadSession();
  if (cachedCookies) {
    try {
      await context.addCookies(cachedCookies);
      await page.goto(`${MATRIX_BASE}/Matrix`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
      await sleep(2000);
      if (!isLoginPage(page.url())) {
        console.log('[CUA] Session cachée valide ✅');
        return page;
      }
      console.log('[CUA] Session expirée → re-login');
      clearCuaSession();
      await context.clearCookies();
    } catch (e) {
      console.warn('[CUA] Session cachée invalide:', e.message);
      clearCuaSession();
      try { await context.clearCookies(); } catch {}
    }
  }

  // ── Login frais ──
  console.log('[CUA] Login Centris...');
  await page.goto(CENTRIS_BASE, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
  await sleep(2000);
  console.log('[CUA] URL initiale:', page.url());

  // ── Step 1: identifiant ──
  try {
    const emailSel = 'input[name="username"], input[type="email"], #username, #identifier, input[autocomplete="username"]';
    await page.waitForSelector(emailSel, { timeout: 10000 });
    await page.fill(emailSel, user);
    const continueSel = 'button[type="submit"], button:has-text("Continuer"), button:has-text("Continue"), button:has-text("Next")';
    await page.click(continueSel);
    await sleep(2000);
  } catch {
    // Peut-être un form combiné username+password sur une seule page — on continue
    console.log('[CUA] Pas de step identifiant séparé — form combiné probable');
  }

  // ── Step 2: mot de passe ──
  const passSel = 'input[name="password"], input[type="password"], #password';
  try {
    await page.waitForSelector(passSel, { timeout: 10000 });
    await page.fill(passSel, pass);
    const submitSel = 'button[type="submit"], button:has-text("Connexion"), button:has-text("Sign In"), button:has-text("Log In"), button:has-text("Se connecter")';
    await page.click(submitSel);
    await sleep(3000);
  } catch (e) {
    throw new Error(`Login step password échoué: ${e.message}`);
  }

  // ── Step 3: MFA (optionnel) ──
  const mfaSel = 'input[name="code"], input[placeholder*="code" i], input[placeholder*="Code"], input[name="mfa"], input[name="otp"]';
  const mfaVisible = await page.isVisible(mfaSel).catch(() => false);
  if (mfaVisible) {
    console.log('[CUA] MFA requis — attente code SMS (90s)...');
    const code = await waitForMFACode();
    if (!code) throw new Error('MFA timeout — pas de code SMS reçu en 90s');
    await page.fill(mfaSel, code);
    await page.click('button[type="submit"]');
    await sleep(3000);
  }

  // ── Vérification login ──
  const finalUrl = page.url();
  if (isLoginPage(finalUrl)) {
    // Screenshot debug
    try {
      const ss = await screenshot(page);
      fs.writeFileSync(path.join(DATA_DIR, 'cua_login_fail.png'), ss);
    } catch {}
    throw new Error(`Login Centris échoué — URL finale: ${finalUrl}\nScreenshot: ${DATA_DIR}/cua_login_fail.png`);
  }

  // ── Sauvegarder session ──
  const cookies = await context.cookies();
  saveSession(cookies);
  console.log('[CUA] Login Centris réussi ✅');
  return page;
}

// ─── CLAUDE COMPUTER USE — BOUCLE D'ACTION ───────────────────────────────────

/**
 * Définition des outils Computer Use pour Claude.
 */
const CUA_TOOLS = [
  {
    type: 'computer_20241022',
    name: 'computer',
    display_width_px: VIEWPORT.width,
    display_height_px: VIEWPORT.height,
    display_number: 1,
  },
];

/**
 * Convertit une action CUA en opération Playwright.
 *
 * Actions supportées: screenshot, click, double_click, right_click,
 * left_click, middle_click, type, key, scroll, mouse_move, drag, wait.
 *
 * @param {import('playwright').Page} page
 * @param {object} action — objet action CUA de Claude
 */
async function executeAction(page, action) {
  const { action: type, coordinate, text, key, direction, amount, start_coordinate, end_coordinate, duration } = action;

  switch (type) {
    case 'screenshot':
      return screenshot(page);

    case 'click':
    case 'left_click':
      await page.mouse.click(coordinate[0], coordinate[1]);
      break;

    case 'double_click':
      await page.mouse.dblclick(coordinate[0], coordinate[1]);
      break;

    case 'right_click':
      await page.mouse.click(coordinate[0], coordinate[1], { button: 'right' });
      break;

    case 'middle_click':
      await page.mouse.click(coordinate[0], coordinate[1], { button: 'middle' });
      break;

    case 'type':
      await page.keyboard.type(text || '', { delay: 30 });
      break;

    case 'key':
      // Translate XDG keysyms to Playwright key names
      await page.keyboard.press(translateKey(key || ''));
      break;

    case 'scroll':
      await page.mouse.move(coordinate[0], coordinate[1]);
      await page.mouse.wheel(
        direction === 'left' ? -(amount || 3) * 100 : direction === 'right' ? (amount || 3) * 100 : 0,
        direction === 'up'   ? -(amount || 3) * 100 : direction === 'down'  ? (amount || 3) * 100 : 0,
      );
      break;

    case 'mouse_move':
      await page.mouse.move(coordinate[0], coordinate[1]);
      break;

    case 'drag':
      if (start_coordinate && end_coordinate) {
        await page.mouse.move(start_coordinate[0], start_coordinate[1]);
        await page.mouse.down();
        await page.mouse.move(end_coordinate[0], end_coordinate[1], { steps: 10 });
        await page.mouse.up();
      }
      break;

    case 'wait':
      await sleep(duration || 1000);
      break;

    default:
      console.warn('[CUA] Action inconnue:', type);
  }

  await sleep(ACTION_DELAY);
}

/**
 * Traduit les touches XDG (utilisées par CUA) vers les noms Playwright.
 */
function translateKey(key) {
  const map = {
    Return: 'Enter',
    BackSpace: 'Backspace',
    Delete: 'Delete',
    Escape: 'Escape',
    Tab: 'Tab',
    super: 'Meta',
    ctrl: 'Control',
    alt: 'Alt',
    shift: 'Shift',
    'ctrl+a': 'Control+a',
    'ctrl+c': 'Control+c',
    'ctrl+v': 'Control+v',
    'ctrl+z': 'Control+z',
    'ctrl+s': 'Control+s',
    Page_Up: 'PageUp',
    Page_Down: 'PageDown',
    Home: 'Home',
    End: 'End',
  };
  return map[key] || key;
}

/**
 * Boucle CUA principale — donne une tâche à Claude, il pilote le browser.
 *
 * @param {import('@anthropic-ai/sdk').Anthropic} client
 * @param {import('playwright').Page} page
 * @param {string} taskPrompt — description de la tâche (ex: "Télécharge le PDF du listing 22264330")
 * @param {function} [onStep] — callback(step, action, result) pour logging externe
 * @returns {Promise<{ success: boolean, result: any, steps: number, error?: string }>}
 */
async function runCuaTask(client, page, taskPrompt, onStep) {
  console.log(`[CUA] Tâche: ${taskPrompt}`);

  // Screenshot initial
  const initSS = await screenshot(page);

  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: initSS.toString('base64') },
        },
        {
          type: 'text',
          text: taskPrompt,
        },
      ],
    },
  ];

  let steps = 0;
  let lastResult = null;

  while (steps < MAX_CUA_STEPS) {
    steps++;

    let response;
    try {
      response = await client.messages.create({
        model: CUA_MODEL,
        max_tokens: 4096,
        tools: CUA_TOOLS,
        messages,
        system: `Tu pilotes un navigateur Chromium pour naviguer sur agent.centris.ca et télécharger des fiches PDF/annexes de listings immobiliers.
Tu es concis et efficace. Quand tu as accompli la tâche, dis "TASK_COMPLETE: <résultat>".
Si tu rencontres une erreur insurmontable, dis "TASK_FAILED: <raison>".
Agis directement — pas d'explications intermédiaires longues.`,
      });
    } catch (e) {
      return { success: false, result: null, steps, error: `API Claude error: ${e.message}` };
    }

    // Analyser la réponse
    const toolUse = response.content.find(b => b.type === 'tool_use');
    const textBlock = response.content.find(b => b.type === 'text');
    const text = textBlock?.text || '';

    // Fin de tâche détectée dans le texte
    if (text.includes('TASK_COMPLETE:')) {
      const result = text.split('TASK_COMPLETE:')[1].trim();
      console.log(`[CUA] ✅ Tâche complète en ${steps} steps: ${result}`);
      return { success: true, result, steps };
    }
    if (text.includes('TASK_FAILED:')) {
      const reason = text.split('TASK_FAILED:')[1].trim();
      console.warn(`[CUA] ❌ Tâche échouée en ${steps} steps: ${reason}`);
      return { success: false, result: null, steps, error: reason };
    }

    // Arrêt si Claude ne veut plus utiliser d'outil
    if (response.stop_reason === 'end_turn' && !toolUse) {
      return { success: false, result: null, steps, error: 'Claude a arrêté sans terminer la tâche' };
    }

    // Exécuter l'action
    if (toolUse && toolUse.name === 'computer') {
      const action = toolUse.input;
      console.log(`[CUA] Step ${steps}: ${action.action}${action.coordinate ? ` @ ${action.coordinate}` : ''}${action.text ? ` "${action.text.slice(0,40)}"` : ''}`);

      let actionResult = null;
      try {
        actionResult = await executeAction(page, action);
        if (onStep) onStep(steps, action, actionResult);
      } catch (e) {
        console.warn(`[CUA] Step ${steps} error:`, e.message);
        actionResult = `Erreur action: ${e.message}`;
      }

      // Préparer le message suivant (screenshot + résultat)
      const newSS = await screenshot(page);
      const assistantMessage = { role: 'assistant', content: response.content };
      const userMessage = {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: newSS.toString('base64') },
              },
            ],
          },
        ],
      };

      messages.push(assistantMessage, userMessage);
      lastResult = { screenshot: newSS };
    }
  }

  return { success: false, result: lastResult, steps, error: `Max steps (${MAX_CUA_STEPS}) atteint sans complétion` };
}

// ─── INTERCEPTEUR RÉSEAU — capturer PDF téléchargé ───────────────────────────

/**
 * Installe un intercepteur sur le context pour capturer les réponses PDF.
 * Retourne une promesse qui résout avec le Buffer du premier PDF intercepté.
 *
 * @param {import('playwright').BrowserContext} context
 * @param {number} timeoutMs
 * @returns {{ promise: Promise<Buffer|null>, cleanup: function }}
 */
function interceptPDF(context, timeoutMs = 60000) {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  let done = false;

  const handler = async response => {
    if (done) return;
    const ct = response.headers()['content-type'] || '';
    if (ct.includes('pdf') || response.url().includes('.pdf')) {
      try {
        const buf = await response.body();
        if (buf && buf.length > 1000) {
          done = true;
          resolve(buf);
        }
      } catch {}
    }
  };

  context.on('response', handler);
  const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeoutMs);

  return {
    promise,
    cleanup: () => {
      clearTimeout(timer);
      context.off('response', handler);
    },
  };
}

// ─── API PUBLIQUE ─────────────────────────────────────────────────────────────

/**
 * Télécharge la fiche PDF officielle d'un listing Centris via Computer Use.
 *
 * Stratégies (dans l'ordre):
 *   1. URL directe Matrix print (si format connu)
 *   2. CUA: naviguer → chercher listing → bouton Imprimer/PDF → intercepter
 *
 * @param {string} centrisNum — numéro Centris 7-9 chiffres
 * @returns {Promise<Buffer|null>} Buffer PDF ou null si échec
 */
async function cuaGetCentrisPDF(centrisNum) {
  if (!CUA_AVAILABLE()) {
    throw new Error('CUA non disponible — Playwright/SDK manquants');
  }
  ensureDirs();

  const num = String(centrisNum).replace(/\D/g, '');
  if (!num || num.length < 7) throw new Error(`Numéro Centris invalide: ${centrisNum}`);

  const cacheFile = path.join(PDF_DIR, `${num}.pdf`);
  // Cache 24h
  if (fs.existsSync(cacheFile)) {
    const stat = fs.statSync(cacheFile);
    if (Date.now() - stat.mtimeMs < 24 * 3600 * 1000) {
      console.log(`[CUA] PDF ${num} depuis cache`);
      return fs.readFileSync(cacheFile);
    }
  }

  const { playwright, Anthropic } = requireDeps();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const browser = await playwright.chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,900',
    ],
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: 'fr-CA',
    timezoneId: 'America/Toronto',
  });

  try {
    const page = await loginCentris(context);

    // ── Stratégie 1: navigation directe vers listing ──
    // Tenter l'URL Matrix standard 2026
    const urls = [
      `${MATRIX_BASE}/Matrix/Listing/${num}`,
      `${MATRIX_BASE}/Matrix/Property/Default.aspx?k=${num}`,
      `${CENTRIS_BASE}/fr/propriete~${num}`,
    ];

    for (const url of urls) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(2000);
        if (!isLoginPage(page.url()) && !page.url().includes('404')) {
          console.log(`[CUA] Listing trouvé à: ${page.url()}`);
          break;
        }
      } catch {}
    }

    // ── Stratégie 2: CUA pilote la navigation + print ──
    const pdfInterceptor = interceptPDF(context, 90000);

    const taskPrompt = `
Tu es sur agent.centris.ca/Matrix. Ta mission: télécharger le PDF officiel du listing Centris #${num}.

ÉTAPES:
1. Si tu vois un champ de recherche, cherche "${num}"
2. Si le listing apparaît dans les résultats, clique dessus
3. Cherche un bouton "Imprimer", "Print", "PDF", ou une icône d'imprimante
4. Clique sur ce bouton pour générer le PDF
5. Attends que le PDF se génère (peut prendre 5-10s)
6. Si une boîte de dialogue apparaît, sélectionne "Enregistrer comme PDF" ou "Print to PDF"

Si tu trouves le PDF et le téléchargement démarre: dis "TASK_COMPLETE: PDF téléchargé"
Si le listing n'existe pas ou est inactif: dis "TASK_FAILED: Listing introuvable"
Si tu ne peux pas accéder au PDF après 10 tentatives: dis "TASK_FAILED: Accès PDF bloqué"
`;

    const cuaResult = await runCuaTask(client, page, taskPrompt);
    const pdfBuffer = await pdfInterceptor.promise;
    pdfInterceptor.cleanup();

    if (pdfBuffer && pdfBuffer.length > 5000) {
      fs.writeFileSync(cacheFile, pdfBuffer);
      console.log(`[CUA] PDF ${num} téléchargé (${Math.round(pdfBuffer.length / 1024)}KB)`);
      return pdfBuffer;
    }

    // ── Stratégie 3: screenshot → PDF (fallback visuel) ──
    if (cuaResult.success) {
      console.log('[CUA] PDF intercepté — essai screenshot-to-PDF fallback');
      const ss = await screenshot(page);
      // Retourner screenshot comme image (bot gère l'affichage)
      return ss; // Buffer PNG — le bot sait que c'est une image si pas de header %PDF
    }

    console.warn(`[CUA] cuaGetCentrisPDF ${num} échoué:`, cuaResult.error);
    return null;

  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/**
 * Télécharge TOUTES les annexes (DV, certificat, plans, rapport) d'un listing Centris.
 *
 * @param {string} centrisNum
 * @param {string} [filtre] — mot-clé pour filtrer (ex: "DV", "déclaration", "localisation")
 * @returns {Promise<Array<{ name: string, buffer: Buffer }>>}
 */
async function cuaGetCentrisAnnexes(centrisNum, filtre = '') {
  if (!CUA_AVAILABLE()) {
    throw new Error('CUA non disponible');
  }
  ensureDirs();

  const num = String(centrisNum).replace(/\D/g, '');
  const { playwright, Anthropic } = requireDeps();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'fr-CA' });
  const annexes = [];

  try {
    const page = await loginCentris(context);

    // Intercepter tous les PDFs
    const capturedPDFs = [];
    context.on('response', async response => {
      const ct = response.headers()['content-type'] || '';
      const url = response.url();
      if (ct.includes('pdf') || url.includes('.pdf')) {
        try {
          const buf = await response.body();
          if (buf && buf.length > 1000) {
            // Extraire nom du PDF depuis URL ou header
            const cd = response.headers()['content-disposition'] || '';
            const nameMatch = cd.match(/filename[*=]"?([^";]+)"?/i);
            const urlName = decodeURIComponent(url.split('/').pop().split('?')[0]);
            const name = nameMatch ? nameMatch[1] : (urlName.endsWith('.pdf') ? urlName : `annexe_${capturedPDFs.length + 1}.pdf`);

            // Appliquer filtre si présent
            if (!filtre || name.toLowerCase().includes(filtre.toLowerCase())) {
              capturedPDFs.push({ name, buffer: buf });
              console.log(`[CUA] Annexe capturée: ${name} (${Math.round(buf.length / 1024)}KB)`);
            }
          }
        } catch {}
      }
    });

    const taskPrompt = `
Tu es sur agent.centris.ca/Matrix. Ta mission: télécharger TOUTES les annexes du listing Centris #${num}.
${filtre ? `Filtre: seulement les documents contenant "${filtre}" dans leur nom.` : ''}

ÉTAPES:
1. Navigue vers le listing #${num} (cherche dans Matrix si nécessaire)
2. Une fois sur la fiche, cherche la section "Annexes", "Documents", "Fichiers joints" ou un onglet similaire
3. Pour CHAQUE annexe visible, clique pour la télécharger/ouvrir
4. Attends que chaque PDF se charge avant de passer au suivant
5. Continue jusqu'à avoir téléchargé toutes les annexes disponibles

Quand tu as téléchargé TOUS les documents disponibles: dis "TASK_COMPLETE: X annexes téléchargées"
Si aucune annexe trouvée: dis "TASK_FAILED: Aucune annexe disponible"
`;

    await runCuaTask(client, page, taskPrompt);

    // Attendre un peu que les derniers PDFs arrivent
    await sleep(3000);
    annexes.push(...capturedPDFs);

  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  console.log(`[CUA] cuaGetCentrisAnnexes ${num}: ${annexes.length} annexe(s)`);
  return annexes;
}

/**
 * Télécharge fiche+annexes et envoie par email.
 * Interface haut niveau pour bot.js — zero dépendance directe Playwright dans bot.
 *
 * @param {object} opts
 * @param {string} opts.centrisNum
 * @param {string} opts.emailTo
 * @param {string} [opts.emailToName]
 * @param {string} [opts.message]
 * @param {string} [opts.filtre]
 * @param {function} opts.sendEmailFn — fonction d'envoi email du bot (bot.sendEmailWithPDFs)
 * @returns {Promise<{ success: boolean, pdfCount: number, fallbackUrl?: string, error?: string }>}
 */
async function cuaDownloadAndEmail({ centrisNum, emailTo, emailToName, message, filtre, sendEmailFn }) {
  const num = String(centrisNum).replace(/\D/g, '');

  if (!CUA_AVAILABLE()) {
    // Fallback: lien public Centris
    const publicUrl = `https://www.centris.ca/fr/propriete~${num}`;
    if (sendEmailFn) {
      await sendEmailFn({
        to: emailTo,
        toName: emailToName,
        subject: `Fiche Centris #${num}`,
        body: `Bonjour,\n\nVoici le lien vers la propriété Centris #${num}:\n${publicUrl}\n\n${message || ''}\n\nAu plaisir,\nShawn Barrette`,
        attachments: [],
      });
    }
    return { success: false, pdfCount: 0, fallbackUrl: publicUrl, error: 'CUA non disponible — lien public envoyé' };
  }

  try {
    const [mainPDF, annexes] = await Promise.allSettled([
      cuaGetCentrisPDF(num),
      cuaGetCentrisAnnexes(num, filtre || ''),
    ]);

    const attachments = [];

    if (mainPDF.status === 'fulfilled' && mainPDF.value) {
      attachments.push({ name: `fiche_${num}.pdf`, buffer: mainPDF.value });
    }
    if (annexes.status === 'fulfilled') {
      attachments.push(...annexes.value);
    }

    if (attachments.length === 0) {
      const fallbackUrl = `https://www.centris.ca/fr/propriete~${num}`;
      return { success: false, pdfCount: 0, fallbackUrl, error: 'Aucun PDF récupéré via CUA' };
    }

    if (sendEmailFn) {
      await sendEmailFn({
        to: emailTo,
        toName: emailToName,
        subject: `Documents Centris #${num}`,
        body: message || `Bonjour,\n\nVeuillez trouver ci-joint les documents pour la propriété #${num}.\n\nAu plaisir,\nShawn Barrette`,
        attachments,
      });
    }

    return { success: true, pdfCount: attachments.length };

  } catch (e) {
    console.error('[CUA] cuaDownloadAndEmail error:', e.message);
    return { success: false, pdfCount: 0, error: e.message };
  }
}

// ─── DIAGNOSTIC ───────────────────────────────────────────────────────────────

/**
 * Test complet du driver — vérifie deps, login, screenshot.
 * @returns {Promise<{ ok: boolean, steps: string[], error?: string }>}
 */
async function diagnoseCUA() {
  const steps = [];

  // 1. Deps
  if (!CUA_AVAILABLE()) {
    return { ok: false, steps, error: 'Playwright ou @anthropic-ai/sdk absent' };
  }
  steps.push('✅ Deps OK (Playwright + SDK)');

  // 2. Env vars
  if (!process.env.CENTRIS_USER || !process.env.CENTRIS_PASS) {
    return { ok: false, steps, error: 'CENTRIS_USER ou CENTRIS_PASS manquants' };
  }
  steps.push('✅ Env vars CENTRIS OK');

  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, steps, error: 'ANTHROPIC_API_KEY manquante' };
  }
  steps.push('✅ ANTHROPIC_API_KEY OK');

  // 3. Browser launch
  const { playwright } = requireDeps();
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
    steps.push('✅ Chromium launch OK');
  } catch (e) {
    return { ok: false, steps, error: `Chromium launch échoué: ${e.message}` };
  }

  // 4. Login Centris
  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    const page = await loginCentris(context);
    steps.push('✅ Login Centris OK');
    const ss = await screenshot(page);
    if (ss && ss.length > 1000) steps.push(`✅ Screenshot OK (${Math.round(ss.length / 1024)}KB)`);
    // Sauvegarder screenshot diagnostic
    ensureDirs();
    fs.writeFileSync(path.join(DATA_DIR, 'cua_diag.png'), ss);
    steps.push(`📸 Screenshot sauvegardé: ${DATA_DIR}/cua_diag.png`);
  } catch (e) {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    return { ok: false, steps, error: `Login échoué: ${e.message}` };
  }

  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  steps.push('✅ Browser fermé proprement');

  return { ok: true, steps };
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

module.exports = {
  CUA_AVAILABLE,
  cuaGetCentrisPDF,
  cuaGetCentrisAnnexes,
  cuaDownloadAndEmail,
  clearCuaSession,
  diagnoseCUA,
  // Internals exposés pour tests
  _internals: {
    loginCentris,
    runCuaTask,
    executeAction,
    interceptPDF,
    waitForMFACode,
    loadSession,
    saveSession,
    clearCuaSession,
    ensureDirs,
    sleep,
  },
};
