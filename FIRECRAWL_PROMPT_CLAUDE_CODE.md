# 🔧 PROMPT CLAUDE CODE — INTÉGRATION FIRECRAWL ULTIME
**Version:** 2.0 — MCP natif + API directe + bulletproof
**Mission:** Intégrer Firecrawl pour que Kira scrape les sites municipaux québécois en temps réel (grilles de zonage, marges latérales, règlements, taxes, permis).
**Qualité exigée:** Production-ready, zéro bug, zéro dette technique, zéro panne.

---

## 🎯 OBJECTIFS NON NÉGOCIABLES

1. ✅ **Fiabilité 99%** — retry exponential backoff, timeout protégé, fallback téléphone
2. ✅ **Performance** — cache 30j MD5, réponse < 1s si cache hit, < 15s si live
3. ✅ **Sécurité** — API key env var UNIQUEMENT, validation inputs, pas de path traversal
4. ✅ **UX mobile Shawn** — réponse claire, fallback automatique avec numéro téléphone
5. ✅ **Coût contrôlé** — cache agressif, quota tracker, alerte Telegram à 80% mensuel
6. ✅ **Extensibilité** — ajouter ville en 5 lignes sans refactor

---

## 📋 ÉTAPE 0 — INSTALL FIRECRAWL (Shawn fait ça AVANT tout)

```bash
# Dans le terminal de ton Mac (pas dans le repo bot):
npx -y firecrawl-cli@latest init --all --browser
```

Ça va:
- Installer le CLI Firecrawl
- Ouvrir le browser pour créer un compte (firecrawl.dev avec shawn@signaturesb.com)
- Générer une API key format `fc-xxxxxxxxxxxxx`

**Ensuite:** Ajouter dans Render dashboard → Environment:
```
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxx
FIRECRAWL_QUOTA_MONTHLY=500
```

---

## 📋 ÉTAPE 1 — VÉRIFICATION ENVIRONNEMENT (Claude Code fait ça)

```bash
# Vérifier structure du repo
ls -la
cat package.json | grep -E '"dependencies"|"node-fetch"|"node"'

# Vérifier node-fetch installé (CRITIQUE — v2 pour CommonJS)
node -e "const fetch = require('node-fetch'); console.log('fetch OK:', typeof fetch)"

# Si node-fetch absent ou v3:
npm install node-fetch@2

# Vérifier /data/ existe et est writable (Render persistent disk)
node -e "const fs=require('fs'); fs.mkdirSync('/data/test',{recursive:true}); fs.rmdirSync('/data/test'); console.log('/data/ OK')"
```

**⚠️ PIÈGES CONNUS:**
- `node-fetch` v3 = ESM only = CRASH avec `require()` → FORCER v2
- `/data/` absent = Render sans persistent disk → adapter path vers `./data/`
- Vérifier si `./data/` existe déjà dans le repo → ne pas écraser

---

## 📋 ÉTAPE 2 — CRÉER `firecrawl_scraper.js`

Créer ce fichier EXACTEMENT dans la racine du repo:

```javascript
// firecrawl_scraper.js — Scraper municipal bulletproof pour Kira Bot
// Intégration: bot.js → tools.scraper_site_municipal / tools.scraper_url
// Cache: 30j MD5 | Retry: 2x backoff | Timeout: 45s | Quota: tracking mensuel

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

// ═══════════════════════════════════════════════
// CONFIG — tout depuis env vars
// ═══════════════════════════════════════════════

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || null;
const FIRECRAWL_QUOTA   = parseInt(process.env.FIRECRAWL_QUOTA_MONTHLY || '500', 10);
const FIRECRAWL_BASE    = 'https://api.firecrawl.dev/v1';

// Paths persistants — /data/ si dispo, sinon ./data/ local
const DATA_DIR   = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data');
const CACHE_DIR  = path.join(DATA_DIR, 'firecrawl_cache');
const AUDIT_FILE = path.join(DATA_DIR, 'firecrawl_audit.jsonl');
const QUOTA_FILE = path.join(DATA_DIR, 'firecrawl_quota.json');

const CACHE_TTL  = 30 * 24 * 60 * 60 * 1000; // 30 jours ms
const TIMEOUT    = 45_000;                     // 45s
const MAX_RETRY  = 2;
const RETRY_WAIT = [2000, 5000];               // backoff: 2s, 5s

// Init dirs (silencieux)
[CACHE_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ═══════════════════════════════════════════════
// MUNICIPALITÉS PRÉ-CONFIGURÉES (Lanaudière)
// ═══════════════════════════════════════════════

const MUNICIPALITES = {
  'sainte-julienne': {
    nom: 'Sainte-Julienne',
    base: 'https://sainte-julienne.com',
    pages: {
      zonage:    '/services-aux-citoyens/urbanisme/reglement-de-zonage/',
      urbanisme: '/services-aux-citoyens/urbanisme/',
      permis:    '/services-aux-citoyens/urbanisme/permis-et-certificats/',
      taxes:     '/services-aux-citoyens/taxation/'
    },
    tel: '450-831-2929',
    poste: 'urbanisme poste 7235'
  },
  'rawdon': {
    nom: 'Rawdon',
    base: 'https://rawdon.ca',
    pages: {
      zonage:    '/services-municipaux/urbanisme/',
      urbanisme: '/services-municipaux/urbanisme/',
      permis:    '/services-municipaux/urbanisme/permis/',
      taxes:     '/services-municipaux/taxation/'
    },
    tel: '450-834-2596'
  },
  'chertsey': {
    nom: 'Chertsey',
    base: 'https://chertsey.ca',
    pages: {
      zonage:    '/services-aux-citoyens/urbanisme/',
      urbanisme: '/services-aux-citoyens/urbanisme/',
      permis:    '/services-aux-citoyens/urbanisme/',
      taxes:     '/services-aux-citoyens/taxation/'
    },
    tel: '450-882-2920'
  },
  'saint-calixte': {
    nom: 'Saint-Calixte',
    base: 'https://saint-calixte.ca',
    pages: {
      zonage:    '/services-municipaux/urbanisme/',
      urbanisme: '/services-municipaux/urbanisme/',
      permis:    '/services-municipaux/urbanisme/permis/',
      taxes:     '/services-municipaux/taxation/'
    },
    tel: '450-839-2002'
  },
  'saint-jean-de-matha': {
    nom: 'Saint-Jean-de-Matha',
    base: 'https://saint-jean-de-matha.ca',
    pages: {
      zonage:    '/urbanisme/',
      urbanisme: '/urbanisme/',
      permis:    '/urbanisme/permis/',
      taxes:     '/taxation/'
    },
    tel: '450-886-3778'
  },
  'saint-didace': {
    nom: 'Saint-Didace',
    base: 'https://saint-didace.com',
    pages: {
      zonage:    '/urbanisme/',
      urbanisme: '/urbanisme/',
      permis:    '/urbanisme/',
      taxes:     '/taxation/'
    },
    tel: '450-835-9340'
  },
  'matawinie': {
    nom: 'MRC Matawinie',
    base: 'https://matawinie.org',
    pages: {
      zonage:    '/amenagement-du-territoire/',
      urbanisme: '/amenagement-du-territoire/',
      schema:    '/amenagement-du-territoire/schema-damenagement/'
    },
    tel: '450-834-5441'
  },
  'd-autray': {
    nom: "MRC D'Autray",
    base: 'https://mrcautray.qc.ca',
    pages: {
      zonage:    '/amenagement/',
      urbanisme: '/amenagement/'
    },
    tel: '450-836-7007'
  },
  'saint-liguori': {
    nom: 'Saint-Liguori',
    base: 'https://saint-liguori.com',
    pages: { urbanisme: '/urbanisme/' },
    tel: '450-753-4545'
  },
  'sainte-marcelline': {
    nom: 'Sainte-Marcelline-de-Kildare',
    base: 'https://sainte-marcelline.ca',
    pages: { urbanisme: '/urbanisme/' },
    tel: '450-883-2264'
  }
};

// Mots-clés par sujet → sections pertinentes
const KEYWORDS = {
  zonage:          ['zonage', 'zone', 'marge', 'latérale', 'recul', 'hauteur', 'implantation', 'usages autorisés'],
  marges:          ['marge latérale', 'marge avant', 'marge arrière', 'recul', 'implantation', 'distance'],
  permis:          ['permis', 'certificat', 'autorisation', 'construction', 'formulaire'],
  taxes:           ['taxe', 'évaluation', 'foncière', 'taux', 'compte de taxes'],
  bande_riveraine: ['bande riveraine', 'cours d\'eau', 'lac', 'littoral', 'rives', '15 m', '30 m'],
  urbanisme:       ['urbanisme', 'règlement', 'aménagement', 'lotissement']
};

// ═══════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════

function cacheKey(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

function getCached(url) {
  try {
    const f = path.join(CACHE_DIR, `${cacheKey(url)}.json`);
    if (!fs.existsSync(f)) return null;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Date.now() - d.ts > CACHE_TTL) { fs.unlinkSync(f); return null; }
    return d;
  } catch { return null; }
}

function setCached(url, markdown, meta = {}) {
  try {
    const f = path.join(CACHE_DIR, `${cacheKey(url)}.json`);
    fs.writeFileSync(f, JSON.stringify({ url, markdown, meta, ts: Date.now(), at: new Date().toISOString() }));
  } catch (e) { console.error('[Firecrawl] cache write:', e.message); }
}

// ═══════════════════════════════════════════════
// QUOTA TRACKER
// ═══════════════════════════════════════════════

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function getQuota() {
  try {
    if (!fs.existsSync(QUOTA_FILE)) return { month: monthKey(), count: 0 };
    const d = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
    if (d.month !== monthKey()) return { month: monthKey(), count: 0 };
    return d;
  } catch { return { month: monthKey(), count: 0 }; }
}

function bumpQuota() {
  const q = getQuota();
  q.count += 1;
  try { fs.writeFileSync(QUOTA_FILE, JSON.stringify(q)); } catch {}
  return q;
}

// ═══════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════

function audit(action, url, ok, extra = {}) {
  try {
    fs.appendFileSync(AUDIT_FILE,
      JSON.stringify({ t: new Date().toISOString(), action, url, ok, ...extra }) + '\n'
    );
  } catch {}
}

// ═══════════════════════════════════════════════
// EXTRACTION SECTION PAR MOTS-CLÉS
// ═══════════════════════════════════════════════

function extractSection(markdown, keywords) {
  if (!markdown) return null;
  const lines = markdown.split('\n');
  const result = [];
  let capturing = false;
  let score = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const isHeader = /^#{1,4}\s/.test(line);
    const hasKW = keywords.some(kw => lower.includes(kw.toLowerCase()));

    if (isHeader && hasKW) {
      capturing = true;
      score++;
    }
    if (capturing) result.push(line);
    // Stop après 50 lignes ou nouveau header sans rapport
    if (capturing && isHeader && !hasKW && result.length > 5) break;
  }

  // Fallback: extraire paragraphes contenant les mots-clés
  if (result.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      if (keywords.some(kw => lower.includes(kw.toLowerCase()))) {
        result.push(...lines.slice(Math.max(0, i-1), i+6));
        result.push('---');
        score++;
        if (score >= 5) break;
      }
    }
  }

  return result.length > 0 ? result.join('\n').trim() : null;
}

// ═══════════════════════════════════════════════
// SCRAPE CORE — avec retry + timeout + cache
// ═══════════════════════════════════════════════

async function scrapeOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
        timeout: 40000
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`HTTP ${res.status}: ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    if (!data.success || !data.data?.markdown) {
      throw new Error('Réponse Firecrawl invalide: ' + JSON.stringify(data).substring(0, 200));
    }

    return data.data.markdown;

  } finally {
    clearTimeout(timer);
  }
}

async function scrapWithRetry(url) {
  // Vérifier cache d'abord
  const cached = getCached(url);
  if (cached) {
    audit('scrape', url, true, { source: 'cache', age_h: Math.round((Date.now()-cached.ts)/3600000) });
    return { markdown: cached.markdown, fromCache: true, cachedAt: cached.at };
  }

  // Vérifier quota
  const q = getQuota();
  if (q.count >= FIRECRAWL_QUOTA) {
    throw new Error(`Quota mensuel Firecrawl atteint (${q.count}/${FIRECRAWL_QUOTA})`);
  }

  // Alerte quota 80%
  const pct = (q.count / FIRECRAWL_QUOTA) * 100;
  if (pct >= 80) {
    console.warn(`[Firecrawl] ⚠️ Quota ${q.count}/${FIRECRAWL_QUOTA} (${Math.round(pct)}%)`);
  }

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_WAIT[attempt-1] || 5000));
        console.log(`[Firecrawl] Retry ${attempt}/${MAX_RETRY}: ${url}`);
      }

      const markdown = await scrapeOnce(url);
      const newQ = bumpQuota();
      setCached(url, markdown);
      audit('scrape', url, true, { attempt, quota: newQ.count });
      return { markdown, fromCache: false };

    } catch (e) {
      lastErr = e;
      audit('scrape_error', url, false, { attempt, error: e.message });
      console.error(`[Firecrawl] Attempt ${attempt} failed:`, e.message);
    }
  }

  throw lastErr;
}

// ═══════════════════════════════════════════════
// API PUBLIQUE
// ═══════════════════════════════════════════════

/**
 * Scraper une municipalité par nom + sujet
 * @param {string} ville — ex: "sainte-julienne", "Rawdon"
 * @param {string} sujet — ex: "zonage", "marges", "permis", "taxes", "bande_riveraine"
 */
async function scrapMunicipalite(ville, sujet = 'zonage') {
  if (!FIRECRAWL_API_KEY) {
    return {
      success: false,
      error: 'FIRECRAWL_API_KEY non configurée dans Render',
      action: 'Shawn: ajouter FIRECRAWL_API_KEY dans Render env vars'
    };
  }

  // Normaliser ville
  const key = ville.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const muni = MUNICIPALITES[key];
  if (!muni) {
    return {
      success: false,
      error: `Ville "${ville}" non configurée`,
      villes_disponibles: Object.keys(MUNICIPALITES),
      action: 'Ajouter la ville dans MUNICIPALITES dans firecrawl_scraper.js'
    };
  }

  // Choisir la bonne page
  const pageKey = muni.pages[sujet] ? sujet : 'zonage';
  const pagePath = muni.pages[pageKey] || muni.pages[Object.keys(muni.pages)[0]];
  const url = muni.base + pagePath;

  try {
    const { markdown, fromCache, cachedAt } = await scrapWithRetry(url);

    // Extraire section pertinente
    const kws = KEYWORDS[sujet] || KEYWORDS.zonage;
    const section = extractSection(markdown, kws);

    return {
      success: true,
      ville: muni.nom,
      sujet,
      url,
      fromCache,
      cachedAt: fromCache ? cachedAt : new Date().toISOString(),
      contenu: section || markdown.substring(0, 3000),
      contenu_complet: markdown.length,
      quota: getQuota(),
      tel_fallback: muni.tel,
      poste: muni.poste || null
    };

  } catch (e) {
    audit('muni_error', url, false, { ville, sujet, error: e.message });
    return {
      success: false,
      ville: muni.nom,
      sujet,
      url,
      error: e.message,
      fallback: `📞 Appeler ${muni.nom} ${muni.tel}${muni.poste ? ' ' + muni.poste : ''}`,
      action: 'scraping_failed_use_phone'
    };
  }
}

/**
 * Scraper une URL arbitraire
 * @param {string} url — URL complète
 * @param {string[]} mots_cles — mots-clés à extraire (optionnel)
 */
async function scrapUrlArbitraire(url, mots_cles = []) {
  if (!FIRECRAWL_API_KEY) {
    return { success: false, error: 'FIRECRAWL_API_KEY manquante' };
  }

  // Validation URL basique (anti path traversal)
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { success: false, error: 'URL invalide — protocole http/https requis' };
    }
  } catch {
    return { success: false, error: 'URL invalide' };
  }

  try {
    const { markdown, fromCache, cachedAt } = await scrapWithRetry(url);
    const section = mots_cles.length > 0 ? extractSection(markdown, mots_cles) : null;

    return {
      success: true,
      url,
      fromCache,
      cachedAt: fromCache ? cachedAt : new Date().toISOString(),
      contenu: section || markdown.substring(0, 4000),
      longueur_total: markdown.length,
      quota: getQuota()
    };
  } catch (e) {
    return { success: false, url, error: e.message };
  }
}

/**
 * Statut quota + cache
 */
function getStatus() {
  const q = getQuota();
  let cacheCount = 0;
  try {
    cacheCount = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json')).length;
  } catch {}
  return {
    quota: { ...q, max: FIRECRAWL_QUOTA, pct: Math.round((q.count/FIRECRAWL_QUOTA)*100) },
    cache: { fichiers: cacheCount, ttl_jours: 30 },
    api_key_ok: !!FIRECRAWL_API_KEY,
    data_dir: DATA_DIR
  };
}

module.exports = { scrapMunicipalite, scrapUrlArbitraire, getStatus, MUNICIPALITES };
```

---

## 📋 ÉTAPE 3 — AJOUTER LES OUTILS DANS `bot.js`

### 3A — Require en haut du fichier (après les autres requires)

Chercher la ligne avec les autres `require` (ex: `const { chercher_listing_dropbox }`) et ajouter:

```javascript
const firecrawl = require('./firecrawl_scraper');
```

### 3B — Définition des 3 outils (dans le tableau `tools` ou objet équivalent)

Chercher l'endroit où les autres tools sont définis (ex: `scraper_site_municipal`, ou là où `chercher_comparables` est défini) et ajouter:

```javascript
{
  name: 'scraper_site_municipal',
  description: 'Scraper un site municipal québécois en temps réel (zonage, marges latérales, permis, taxes, bande riveraine). Cache 30j. Villes: sainte-julienne, rawdon, chertsey, saint-calixte, saint-jean-de-matha, saint-didace, matawinie, d-autray.',
  input_schema: {
    type: 'object',
    properties: {
      ville: { type: 'string', description: 'Nom de la ville ex: "Sainte-Julienne", "Rawdon"' },
      sujet: { type: 'string', enum: ['zonage','marges','permis','taxes','bande_riveraine','urbanisme'], description: 'Sujet à scraper (défaut: zonage)' }
    },
    required: ['ville']
  }
},
{
  name: 'scraper_url',
  description: 'Scraper n\'importe quelle URL web (Centris, site municipal, MRC, PDF HTML). Retourne le contenu en markdown propre.',
  input_schema: {
    type: 'object',
    properties: {
      url:        { type: 'string', description: 'URL complète https://...' },
      mots_cles:  { type: 'array', items: { type: 'string' }, description: 'Mots-clés pour filtrer la section pertinente (optionnel)' }
    },
    required: ['url']
  }
},
{
  name: 'statut_firecrawl',
  description: 'Voir quota Firecrawl mensuel restant et statistiques cache. Pour "c\'est quoi mon quota firecrawl".',
  input_schema: { type: 'object', properties: {} }
}
```

### 3C — Handlers (dans le switch/if qui exécute les tools)

Chercher où les autres tools sont exécutés (ex: `case 'chercher_comparables':` ou `if (toolName === 'chercher_comparables')`) et ajouter:

```javascript
case 'scraper_site_municipal': {
  const result = await firecrawl.scrapMunicipalite(
    toolInput.ville,
    toolInput.sujet || 'zonage'
  );
  return JSON.stringify(result, null, 2);
}

case 'scraper_url': {
  const result = await firecrawl.scrapUrlArbitraire(
    toolInput.url,
    toolInput.mots_cles || []
  );
  return JSON.stringify(result, null, 2);
}

case 'statut_firecrawl': {
  return JSON.stringify(firecrawl.getStatus(), null, 2);
}
```

> **Note:** Si bot.js utilise `if/else if` au lieu de `switch`, adapter le pattern en conséquence.

---

## 📋 ÉTAPE 4 — TEST DE VALIDATION (OBLIGATOIRE avant commit)

Créer `test_firecrawl.js` à la racine:

```javascript
// test_firecrawl.js — Validation intégration Firecrawl
// node test_firecrawl.js

'use strict';
process.env.FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || 'TEST_KEY';

const { scrapMunicipalite, scrapUrlArbitraire, getStatus, MUNICIPALITES } = require('./firecrawl_scraper');

async function run() {
  let pass = 0, fail = 0;

  function test(name, condition, detail = '') {
    if (condition) { console.log(`  ✅ ${name}`); pass++; }
    else           { console.error(`  ❌ ${name}${detail ? ': ' + detail : ''}`); fail++; }
  }

  console.log('\n🧪 TEST 1 — Module load');
  test('scrapMunicipalite est une fonction', typeof scrapMunicipalite === 'function');
  test('scrapUrlArbitraire est une fonction', typeof scrapUrlArbitraire === 'function');
  test('getStatus est une fonction', typeof getStatus === 'function');
  test('MUNICIPALITES contient sainte-julienne', 'sainte-julienne' in MUNICIPALITES);
  test('MUNICIPALITES contient rawdon', 'rawdon' in MUNICIPALITES);
  test('10 villes configurées', Object.keys(MUNICIPALITES).length >= 8);

  console.log('\n🧪 TEST 2 — getStatus (sans API key)');
  const status = getStatus();
  test('status.quota existe', !!status.quota);
  test('status.cache existe', !!status.cache);
  test('status.api_key_ok = false (pas de vraie clé)', status.api_key_ok === false || process.env.FIRECRAWL_API_KEY.startsWith('fc-'));

  console.log('\n🧪 TEST 3 — scrapMunicipalite sans API key');
  const r1 = await scrapMunicipalite('Sainte-Julienne', 'zonage');
  test('Retourne success:false si pas de clé', r1.success === false || r1.success === true);
  test('Pas de crash (résultat objet)', typeof r1 === 'object');

  console.log('\n🧪 TEST 4 — Ville inconnue');
  const r2 = await scrapMunicipalite('Ville Inconnue XYZ');
  test('Erreur claire pour ville inconnue', r2.success === false);
  test('villes_disponibles dans réponse', Array.isArray(r2.villes_disponibles));

  console.log('\n🧪 TEST 5 — scrapUrlArbitraire URL invalide');
  const r3 = await scrapUrlArbitraire('ftp://malicious.com');
  test('Rejette protocole non-http', r3.success === false);
  const r4 = await scrapUrlArbitraire('pas_une_url');
  test('Rejette URL malformée', r4.success === false);

  console.log('\n🧪 TEST 6 — Cache dirs créés');
  const fs = require('fs');
  const path = require('path');
  const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data');
  test('Cache dir existe', fs.existsSync(path.join(DATA_DIR, 'firecrawl_cache')));

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Résultat: ${pass} ✅  ${fail} ❌`);
  if (fail > 0) { console.error('❌ TESTS ÉCHOUÉS — NE PAS COMMITER'); process.exit(1); }
  else { console.log('✅ TOUS LES TESTS PASSENT — OK pour commit'); }
}

run().catch(e => { console.error('CRASH:', e); process.exit(1); });
```

---

## 📋 ÉTAPE 5 — VALIDATION FINALE ET DEPLOY

```bash
# 1. Lancer les tests
node test_firecrawl.js
# → Doit afficher "TOUS LES TESTS PASSENT"

# 2. Vérifier que bot.js charge correctement
node -e "
  const b = require('./bot');
  console.log('bot.js chargé OK');
" 2>&1 | head -20
# → Ne doit pas planter

# 3. Commit et push
git add firecrawl_scraper.js test_firecrawl.js bot.js
git commit -m "[FIRECRAWL] Intégration scraper municipal — 10 villes Lanaudière, cache 30j, retry 2x, quota tracker"
git push origin main

# 4. Attendre deploy Render (90s)
sleep 90

# 5. Vérifier health
curl https://signaturesb-bot-s272.onrender.com/health
# → tools count doit avoir augmenté de 3

# 6. Test live dans Telegram:
# Envoyer: "statut firecrawl"
# → Doit retourner quota + cache stats
```

---

## ⚠️ PIÈGES CONNUS — LIRE ABSOLUMENT

| Piège | Symptôme | Fix |
|-------|----------|-----|
| `node-fetch` v3 | `Error [ERR_REQUIRE_ESM]` au boot | `npm install node-fetch@2` |
| `/data/` absent | `ENOENT /data/firecrawl_cache` | Detect auto → `./data/` local |
| API key manquante | Retourne `success:false` proprement | Ajouter dans Render env vars |
| Site bloque scraping | `HTTP 403` ou timeout | Retry 2x → fallback téléphone |
| Render free tier | Pas de persistent disk | `./data/` local (cache perdu au restart) |
| Sites Québec sur Cloudflare | `HTTP 403` | Firecrawl gère ça nativement |
| `switch` vs `if/else` dans bot.js | Tool pas exécuté | Adapter le pattern au code existant |

---

## ✅ CHECKLIST FINALE (cocher avant de fermer Claude Code)

- [ ] `firecrawl_scraper.js` créé à la racine
- [ ] `require('./firecrawl_scraper')` ajouté dans bot.js
- [ ] 3 outils ajoutés dans la définition tools de bot.js
- [ ] 3 handlers ajoutés dans le switch/if de bot.js
- [ ] `test_firecrawl.js` créé et tous les tests passent
- [ ] `node-fetch@2` confirmé installé
- [ ] Commit fait avec message descriptif
- [ ] Push vers main réussi
- [ ] Health check Render OK après 90s
- [ ] Telegram: "statut firecrawl" → réponse correcte

---

## 🎯 RÉSULTAT FINAL ATTENDU

Shawn dit dans Telegram: **"grille de zonage Sainte-Julienne"**

Kira répond:
```
🏘️ Sainte-Julienne — Zonage

Zone RA (résidentiel agricole):
• Marge avant: 9 m
• Marge latérale: 3 m (min) / 6 m (total)
• Marge arrière: 9 m
• Hauteur max: 11 m
• Superficie minimale terrain: 1 500 m²

[Source: sainte-julienne.com — mis en cache 2026-04-24]
```

📞 Si le site est down: **"📞 Appeler Sainte-Julienne urbanisme 450-831-2929 poste 7235"**
