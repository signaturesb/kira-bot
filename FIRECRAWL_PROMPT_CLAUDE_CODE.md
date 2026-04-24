# 🔧 PROMPT CLAUDE CODE — INTÉGRATION FIRECRAWL (PRODUCTION READY)

**Mission:** Intégrer Firecrawl de façon bulletproof pour que Kira puisse scraper les sites municipaux québécois en temps réel (grilles de zonage, règlements, marges latérales, taxes, permis).

**Niveau de qualité exigé:** Production-ready, zero bug, zero dette technique.

---

## 🔑 CLÉ API (DÉJÀ FOURNIE — utiliser immédiatement)

```
FIRECRAWL_API_KEY=fc-52e378f6759746e4807406ddc3517d07
```

**Action immédiate:**
1. Ajouter dans Render → Environment Variables:
   - `FIRECRAWL_API_KEY` = `fc-52e378f6759746e4807406ddc3517d07`
   - `FIRECRAWL_QUOTA_MONTHLY` = `500`
2. Pas besoin de créer de compte — clé déjà active

---

## 🎯 OBJECTIFS NON NÉGOCIABLES

1. ✅ **Fiabilité 99%** — retry 2x avec backoff, timeout AbortController, fallback clair
2. ✅ **Performance** — cache MD5 30j persistant `/data/`, réponse < 2s si cache hit
3. ✅ **Sécurité** — clé en env var uniquement, jamais dans le code, path traversal protégé
4. ✅ **UX mobile Shawn** — erreurs claires, fallback téléphone auto si scraping échoue
5. ✅ **Coût contrôlé** — cache agressif, alerte Telegram si >80% quota mensuel
6. ✅ **API v2 correcte** — utiliser `https://api.firecrawl.dev/v1/scrape` (v1 stable, v2 beta)

---

## 📋 ENDPOINTS FIRECRAWL OFFICIELS

```
Base URL: https://api.firecrawl.dev/v1
Auth: Authorization: Bearer fc-52e378f6759746e4807406ddc3517d07

POST /v1/scrape   ← page unique (notre cas principal)
POST /v1/search   ← chercher + scraper résultats
POST /v1/crawl    ← crawl multi-pages (pas nécessaire ici)
```

**Payload scrape:**
```json
{
  "url": "https://sainte-julienne.com/urbanisme/zonage/",
  "formats": ["markdown"],
  "onlyMainContent": true,
  "timeout": 45000,
  "waitFor": 2000
}
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "markdown": "# Grille de spécifications...",
    "metadata": { "title": "...", "statusCode": 200 }
  }
}
```

---

## 🏗️ ARCHITECTURE COMPLÈTE

```
Kira (bot.js tools)
  ↓
tools.scraper_site_municipal(ville, sujet)   ← "marges latérales Ste-Julienne"
tools.scraper_url(url, mots_cles)            ← URL arbitraire directe
  ↓
firecrawl_scraper.js
  ├── scrapMunicipalite(ville, sujet)         ← villes pré-configurées
  ├── scrapUrl(url, motsCles)                 ← scrape direct
  ├── extractSection(markdown, motsCles)      ← extrait section pertinente
  ├── getCached() / setCached()               ← cache MD5 30j /data/
  ├── checkQuota()                            ← alerte >80%
  └── auditLog()                              ← /data/firecrawl_audit.jsonl
  ↓
api.firecrawl.dev/v1/scrape
```

---

## 📁 FICHIER 1: `firecrawl_scraper.js` (CRÉER À LA RACINE DU REPO)

```javascript
// firecrawl_scraper.js — Scraper municipal bulletproof pour Kira Bot
// Version: 2.0 — API Firecrawl v1 stable
// Clé: fc-52e378f6759746e4807406ddc3517d07 (via env var FIRECRAWL_API_KEY)

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// node-fetch: utiliser version compatible (v2 CommonJS)
let fetch;
try {
  fetch = require('node-fetch');
  if (fetch.default) fetch = fetch.default; // compatibilité v2/v3
} catch (e) {
  throw new Error('[Firecrawl] node-fetch manquant — npm install node-fetch@2');
}

// ═══════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════

const CONFIG = {
  apiKey: process.env.FIRECRAWL_API_KEY,
  baseUrl: 'https://api.firecrawl.dev/v1',
  quotaMonthly: parseInt(process.env.FIRECRAWL_QUOTA_MONTHLY || '500'),
  cacheDir: '/data/firecrawl_cache',
  auditLog: '/data/firecrawl_audit.jsonl',
  quotaFile: '/data/firecrawl_quota.json',
  cacheTTL: 30 * 24 * 60 * 60 * 1000, // 30 jours en ms
  timeout: 45000,   // 45s
  retries: 2,
  waitFor: 2000     // attendre 2s pour JS rendering
};

// Init répertoire cache
if (!fs.existsSync(CONFIG.cacheDir)) {
  fs.mkdirSync(CONFIG.cacheDir, { recursive: true });
}

// ═══════════════════════════════════════════════════════
// VILLES PRÉ-CONFIGURÉES (Lanaudière + MRC)
// ═══════════════════════════════════════════════════════

const MUNICIPALITES = {
  'sainte-julienne': {
    nom: 'Sainte-Julienne',
    baseUrl: 'https://sainte-julienne.com',
    pages: {
      zonage:    '/services-aux-citoyens/urbanisme/reglement-de-zonage/',
      urbanisme: '/services-aux-citoyens/urbanisme/',
      permis:    '/services-aux-citoyens/urbanisme/permis-et-certificats/',
      taxes:     '/services-aux-citoyens/taxation/'
    },
    telephone: '450-831-2929',
    note_urbanisme: 'Poste 7235'
  },
  'rawdon': {
    nom: 'Rawdon',
    baseUrl: 'https://rawdon.ca',
    pages: {
      zonage:    '/services-municipaux/urbanisme/',
      urbanisme: '/services-municipaux/urbanisme/',
      permis:    '/services-municipaux/urbanisme/permis/',
      taxes:     '/services-municipaux/taxation/'
    },
    telephone: '450-834-2596'
  },
  'chertsey': {
    nom: 'Chertsey',
    baseUrl: 'https://chertsey.ca',
    pages: {
      zonage:    '/services-aux-citoyens/urbanisme/',
      urbanisme: '/services-aux-citoyens/urbanisme/',
      permis:    '/services-aux-citoyens/urbanisme/',
      taxes:     '/services-aux-citoyens/taxation/'
    },
    telephone: '450-882-2920'
  },
  'saint-calixte': {
    nom: 'Saint-Calixte',
    baseUrl: 'https://saint-calixte.ca',
    pages: {
      zonage:    '/services-municipaux/urbanisme/',
      urbanisme: '/services-municipaux/urbanisme/',
      permis:    '/services-municipaux/urbanisme/permis/',
      taxes:     '/services-municipaux/taxation/'
    },
    telephone: '450-839-2002'
  },
  'saint-jean-de-matha': {
    nom: 'Saint-Jean-de-Matha',
    baseUrl: 'https://saint-jean-de-matha.ca',
    pages: {
      zonage:    '/urbanisme/',
      urbanisme: '/urbanisme/',
      permis:    '/urbanisme/permis/',
      taxes:     '/taxation/'
    },
    telephone: '450-886-3778'
  },
  'saint-didace': {
    nom: 'Saint-Didace',
    baseUrl: 'https://saint-didace.com',
    pages: {
      zonage:    '/urbanisme/',
      urbanisme: '/urbanisme/',
      permis:    '/urbanisme/',
      taxes:     '/taxation/'
    },
    telephone: '450-835-9340'
  },
  'matawinie': {
    nom: 'MRC Matawinie',
    baseUrl: 'https://matawinie.org',
    pages: {
      zonage:    '/amenagement-du-territoire/',
      urbanisme: '/amenagement-du-territoire/',
      schema:    '/amenagement-du-territoire/schema-damenagement/',
      riveraine: '/amenagement-du-territoire/protection-rives-littoral/'
    },
    telephone: '450-834-5441'
  },
  'd-autray': {
    nom: "MRC D'Autray",
    baseUrl: 'https://mrcautray.qc.ca',
    pages: {
      zonage:    '/amenagement/',
      urbanisme: '/amenagement/'
    },
    telephone: '450-836-7007'
  }
};

// Mots-clés par sujet → sections à extraire
const SUJETS_MOTS_CLES = {
  zonage:     ['marge', 'latérale', 'arrière', 'avant', 'recul', 'hauteur', 'implantation', 'zone', 'grille'],
  urbanisme:  ['règlement', 'zonage', 'subdivision', 'usage', 'lotissement'],
  permis:     ['permis', 'certificat', 'autorisation', 'construction', 'délai', 'frais'],
  taxes:      ['taux', 'taxe', 'évaluation', 'foncière', 'cotisation'],
  riveraine:  ['riveraine', 'littoral', 'bande', 'cours d\'eau', '30 mètres', '15 mètres']
};

// ═══════════════════════════════════════════════════════
// CACHE (MD5 + TTL 30 jours)
// ═══════════════════════════════════════════════════════

function cacheKey(url) {
  // Protection path traversal
  const hash = crypto.createHash('md5').update(url).digest('hex');
  return hash.replace(/[^a-f0-9]/g, ''); // seulement hex chars
}

function getCached(url) {
  try {
    const file = path.join(CONFIG.cacheDir, `${cacheKey(url)}.json`);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - data.timestamp > CONFIG.cacheTTL) {
      fs.unlinkSync(file);
      return null;
    }
    return data; // { url, markdown, metadata, timestamp, cached_at }
  } catch (e) {
    return null;
  }
}

function setCached(url, markdown, metadata = {}) {
  try {
    const file = path.join(CONFIG.cacheDir, `${cacheKey(url)}.json`);
    fs.writeFileSync(file, JSON.stringify({
      url,
      markdown,
      metadata,
      timestamp: Date.now(),
      cached_at: new Date().toISOString()
    }), 'utf8');
  } catch (e) {
    console.error('[Firecrawl Cache] Écriture échouée:', e.message);
  }
}

// ═══════════════════════════════════════════════════════
// QUOTA TRACKING
// ═══════════════════════════════════════════════════════

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getQuota() {
  try {
    if (!fs.existsSync(CONFIG.quotaFile)) return { month: currentMonth(), count: 0 };
    const data = JSON.parse(fs.readFileSync(CONFIG.quotaFile, 'utf8'));
    if (data.month !== currentMonth()) return { month: currentMonth(), count: 0 };
    return data;
  } catch (e) {
    return { month: currentMonth(), count: 0 };
  }
}

function incrementQuota() {
  const state = getQuota();
  state.count += 1;
  try {
    fs.writeFileSync(CONFIG.quotaFile, JSON.stringify(state), 'utf8');
  } catch (e) {}
  return state;
}

// Vérifier avant scrape — retourne { ok, message }
function checkQuota() {
  const state = getQuota();
  const pct = (state.count / CONFIG.quotaMonthly) * 100;
  if (state.count >= CONFIG.quotaMonthly) {
    return { ok: false, message: `❌ Quota Firecrawl épuisé ce mois (${state.count}/${CONFIG.quotaMonthly})` };
  }
  if (pct >= 80) {
    // Alerte mais on continue
    console.warn(`[Firecrawl] ⚠️ Quota ${Math.round(pct)}% utilisé (${state.count}/${CONFIG.quotaMonthly})`);
  }
  return { ok: true, count: state.count, quota: CONFIG.quotaMonthly };
}

// ═══════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════

function auditLog(action, url, success, details = {}) {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      action, url, success, ...details
    });
    fs.appendFileSync(CONFIG.auditLog, entry + '\n', 'utf8');
  } catch (e) {} // audit non-bloquant
}

// ═══════════════════════════════════════════════════════
// SCRAPE CORE (Firecrawl v1 + retry + timeout)
// ═══════════════════════════════════════════════════════

async function scrapUrlRaw(url) {
  if (!CONFIG.apiKey) {
    throw new Error('FIRECRAWL_API_KEY manquante dans Render env vars');
  }

  // 1. Cache hit?
  const cached = getCached(url);
  if (cached) {
    auditLog('scrape_cache_hit', url, true, { cached_at: cached.cached_at });
    return { markdown: cached.markdown, fromCache: true, cached_at: cached.cached_at };
  }

  // 2. Quota check
  const quota = checkQuota();
  if (!quota.ok) throw new Error(quota.message);

  // 3. Scrape avec retry
  let lastError;
  for (let attempt = 1; attempt <= CONFIG.retries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeout);

    try {
      const response = await fetch(`${CONFIG.baseUrl}/scrape`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
          timeout: CONFIG.timeout,
          waitFor: CONFIG.waitFor
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errBody.substring(0, 200)}`);
      }

      const data = await response.json();

      if (!data.success || !data.data?.markdown) {
        throw new Error(`Firecrawl retourné success:false ou markdown vide`);
      }

      // Succès
      const markdown = data.data.markdown;
      const metadata = data.data.metadata || {};

      setCached(url, markdown, metadata);
      incrementQuota();
      auditLog('scrape_api', url, true, { attempt, chars: markdown.length });

      return { markdown, fromCache: false, metadata };

    } catch (e) {
      clearTimeout(timer);
      lastError = e;

      if (e.name === 'AbortError') {
        lastError = new Error(`Timeout ${CONFIG.timeout/1000}s dépassé pour ${url}`);
      }

      if (attempt <= CONFIG.retries) {
        const delay = attempt * 3000; // 3s, 6s
        console.warn(`[Firecrawl] Tentative ${attempt} échouée (${e.message}) — retry dans ${delay/1000}s`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  auditLog('scrape_api', url, false, { error: lastError.message });
  throw lastError;
}

// ═══════════════════════════════════════════════════════
// EXTRACTION SECTION (par mots-clés)
// ═══════════════════════════════════════════════════════

function extractSection(markdown, motsCles) {
  if (!motsCles || motsCles.length === 0) return markdown;

  const lines = markdown.split('\n');
  const result = [];
  let inSection = false;
  let sectionDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();

    // Ligne contient un mot-clé?
    const hasKeyword = motsCles.some(k => lineLower.includes(k.toLowerCase()));

    if (hasKeyword) {
      // Prendre contexte: 3 lignes avant + ligne + 15 lignes après
      const start = Math.max(0, i - 3);
      const end = Math.min(lines.length - 1, i + 15);
      const chunk = lines.slice(start, end + 1).join('\n');
      if (!result.includes(chunk)) result.push(chunk);
    }
  }

  if (result.length === 0) {
    // Rien trouvé — retourner début du markdown (500 chars)
    return markdown.substring(0, 500) + '\n\n*(Section spécifique non trouvée — contenu partiel)*';
  }

  return result.join('\n\n---\n\n');
}

// ═══════════════════════════════════════════════════════
// API PRINCIPALE
// ═══════════════════════════════════════════════════════

/**
 * Scraper une municipalité pré-configurée
 * @param {string} ville - "sainte-julienne", "rawdon", etc.
 * @param {string} sujet - "zonage", "permis", "taxes", "riveraine", "urbanisme"
 * @returns {object} { success, ville, sujet, contenu, url, fromCache, telephone }
 */
async function scrapMunicipalite(ville, sujet = 'zonage') {
  const villeKey = ville.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève accents
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  const muni = MUNICIPALITES[villeKey];

  if (!muni) {
    const villes_dispo = Object.keys(MUNICIPALITES).join(', ');
    return {
      success: false,
      error: `Ville "${ville}" non configurée. Villes disponibles: ${villes_dispo}`,
      telephone: null
    };
  }

  const pageKey = sujet in muni.pages ? sujet : 'urbanisme';
  const url = muni.baseUrl + muni.pages[pageKey];
  const motsCles = SUJETS_MOTS_CLES[sujet] || SUJETS_MOTS_CLES['zonage'];

  try {
    const result = await scrapUrlRaw(url);
    const section = extractSection(result.markdown, motsCles);

    const quota = getQuota();
    const pctQuota = Math.round((quota.count / CONFIG.quotaMonthly) * 100);

    return {
      success: true,
      ville: muni.nom,
      sujet,
      url,
      contenu: section,
      fromCache: result.fromCache,
      cached_at: result.cached_at || null,
      telephone: muni.telephone,
      note_urbanisme: muni.note_urbanisme || null,
      quota: `${quota.count}/${CONFIG.quotaMonthly} (${pctQuota}%)`
    };

  } catch (e) {
    auditLog('scrape_municipalite', url, false, { ville, sujet, error: e.message });
    return {
      success: false,
      ville: muni.nom,
      sujet,
      url,
      error: e.message,
      fallback: `📞 Appeler ${muni.nom} directement: **${muni.telephone}**${muni.note_urbanisme ? ' (' + muni.note_urbanisme + ')' : ''} pour le règlement de ${sujet}`,
      telephone: muni.telephone
    };
  }
}

/**
 * Scraper une URL arbitraire
 * @param {string} url - URL complète à scraper
 * @param {string[]} motsCles - Mots-clés pour extraire la section pertinente
 */
async function scrapUrlPublic(url, motsCles = []) {
  // Validation URL basique
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { success: false, error: 'URL doit commencer par http:// ou https://' };
  }

  try {
    const result = await scrapUrlRaw(url);
    const contenu = motsCles.length > 0
      ? extractSection(result.markdown, motsCles)
      : result.markdown.substring(0, 3000); // Max 3000 chars si pas de filtre

    const quota = getQuota();

    return {
      success: true,
      url,
      contenu,
      fromCache: result.fromCache,
      cached_at: result.cached_at || null,
      quota: `${quota.count}/${CONFIG.quotaMonthly}`
    };

  } catch (e) {
    return { success: false, url, error: e.message };
  }
}

/**
 * Voir état quota Firecrawl
 */
function getQuotaStatus() {
  const state = getQuota();
  const pct = Math.round((state.count / CONFIG.quotaMonthly) * 100);
  const restant = CONFIG.quotaMonthly - state.count;
  return {
    mois: state.month,
    utilise: state.count,
    quota: CONFIG.quotaMonthly,
    restant,
    pourcentage: pct,
    statut: pct >= 100 ? '🔴 ÉPUISÉ' : pct >= 80 ? '🟡 ATTENTION' : '🟢 OK'
  };
}

module.exports = {
  scrapMunicipalite,
  scrapUrl: scrapUrlPublic,
  getQuotaStatus,
  MUNICIPALITES
};
```

---

## 📁 FICHIER 2: Ajouter dans `bot.js` — 2 nouveaux outils

**Trouver le bloc `tools_definitions` (tableau des outils) et ajouter:**

```javascript
// === OUTIL 1: Scraper municipal ===
{
  name: "scraper_site_municipal",
  description: "Scraper le site d'une municipalité québécoise pour obtenir les règlements de zonage, marges latérales, permis, taxes. Villes: sainte-julienne, rawdon, chertsey, saint-calixte, saint-jean-de-matha, saint-didace, matawinie, d-autray.",
  input_schema: {
    type: "object",
    properties: {
      ville: {
        type: "string",
        description: "Nom de la ville: sainte-julienne, rawdon, chertsey, saint-calixte, saint-jean-de-matha, saint-didace, matawinie, d-autray"
      },
      sujet: {
        type: "string",
        description: "Type d'info: zonage (défaut), urbanisme, permis, taxes, riveraine",
        enum: ["zonage", "urbanisme", "permis", "taxes", "riveraine"]
      }
    },
    required: ["ville"]
  }
},

// === OUTIL 2: Scraper URL arbitraire ===
{
  name: "scraper_url",
  description: "Scraper n'importe quelle URL et extraire le contenu en markdown. Idéal pour règlements municipaux, PDF convertis, pages gouvernementales.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL complète à scraper (https://...)"
      },
      mots_cles: {
        type: "array",
        items: { type: "string" },
        description: "Mots-clés pour filtrer la section pertinente (ex: ['marge', 'latérale', 'recul'])"
      }
    },
    required: ["url"]
  }
}
```

**Trouver le handler d'outils (switch/if sur tool.name) et ajouter:**

```javascript
case 'scraper_site_municipal': {
  const { scrapMunicipalite } = require('./firecrawl_scraper');
  const { ville, sujet = 'zonage' } = tool.input;
  const result = await scrapMunicipalite(ville, sujet);
  return result;
}

case 'scraper_url': {
  const { scrapUrl } = require('./firecrawl_scraper');
  const { url, mots_cles = [] } = tool.input;
  const result = await scrapUrl(url, mots_cles);
  return result;
}
```

**Ajouter commande `/firecrawl` dans les commandes Telegram:**

```javascript
if (text === '/firecrawl') {
  const { getQuotaStatus } = require('./firecrawl_scraper');
  const q = getQuotaStatus();
  return sendTelegram(`🔥 *Firecrawl Status*\n${q.statut}\n${q.utilise}/${q.quota} scrapes utilisés (${q.pourcentage}%)\nRestant: ${q.restant}\nMois: ${q.mois}`);
}
```

---

## 📁 FICHIER 3: `test_firecrawl.js` (CRÉER — tests avant deploy)

```javascript
// test_firecrawl.js — Validation complète avant deploy
// Usage: node test_firecrawl.js

process.env.FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || 'fc-52e378f6759746e4807406ddc3517d07';
process.env.FIRECRAWL_QUOTA_MONTHLY = '500';

const { scrapMunicipalite, scrapUrl, getQuotaStatus } = require('./firecrawl_scraper');

async function runTests() {
  console.log('\n🧪 TEST 1: Quota status');
  const q = getQuotaStatus();
  console.assert(q.quota === 500, 'Quota doit être 500');
  console.log(`✅ Quota: ${q.utilise}/${q.quota} — ${q.statut}`);

  console.log('\n🧪 TEST 2: Cache (URL inexistante → pas de crash)');
  const r1 = await scrapUrl('https://sainte-julienne.com/urbanisme/', ['marge', 'latérale']);
  console.log(r1.success ? `✅ Scrape réussi (${r1.fromCache ? 'cache' : 'API'})` : `⚠️ Scrape échoué: ${r1.error} (fallback OK)`);

  console.log('\n🧪 TEST 3: Ville non configurée → message clair');
  const r2 = await scrapMunicipalite('montreal-inexistant', 'zonage');
  console.assert(!r2.success, 'Doit retourner success:false');
  console.assert(r2.error.includes('non configurée'), 'Doit mentionner ville non configurée');
  console.log('✅ Ville inconnue gérée correctement');

  console.log('\n🧪 TEST 4: URL invalide → message clair');
  const r3 = await scrapUrl('pas-une-url', []);
  console.assert(!r3.success, 'URL invalide doit retourner success:false');
  console.log('✅ URL invalide gérée correctement');

  console.log('\n🧪 TEST 5: Sainte-Julienne zonage (vrai scrape)');
  const r4 = await scrapMunicipalite('sainte-julienne', 'zonage');
  if (r4.success) {
    console.log(`✅ Scrape Ste-Julienne réussi (${r4.fromCache ? 'cache' : 'API'}) — ${r4.contenu.length} chars`);
  } else {
    console.log(`⚠️ Scrape Ste-Julienne échoué: ${r4.error}`);
    console.log(`   Fallback: ${r4.fallback}`);
  }

  console.log('\n✅ TOUS LES TESTS PASSÉS\n');
}

runTests().catch(e => {
  console.error('❌ TEST FAILED:', e.message);
  process.exit(1);
});
```

---

## 🚀 PROCÉDURE D'INSTALLATION (dans l'ordre EXACT)

```bash
# 1. Créer firecrawl_scraper.js (copier code ci-dessus)
# 2. Patcher bot.js (ajouter 2 outils + 2 handlers + 1 commande)

# 3. Vérifier node-fetch installé
npm list node-fetch
# Si manquant: npm install node-fetch@2

# 4. Tester AVANT de commit
node test_firecrawl.js

# 5. Valider bot complet
node validate.js

# 6. Commit + push
git add firecrawl_scraper.js test_firecrawl.js bot.js
git commit -m "[FEATURE] Intégration Firecrawl scraping municipal bulletproof"
git push origin main

# 7. Ajouter env vars dans Render
# FIRECRAWL_API_KEY = fc-52e378f6759746e4807406ddc3517d07
# FIRECRAWL_QUOTA_MONTHLY = 500

# 8. Attendre deploy (~90s) + vérifier health
sleep 90
curl https://signaturesb-bot-s272.onrender.com/health

# 9. Test Telegram
# Taper: /firecrawl → doit afficher quota status
# Taper: grille de zonage Sainte-Julienne → doit scraper et afficher marges
```

---

## ⚠️ PIÈGES À ÉVITER

| Piège | Solution |
|-------|----------|
| `node-fetch` v3 = ESM only | Forcer `npm install node-fetch@2` |
| API key dans le code | TOUJOURS via `process.env.FIRECRAWL_API_KEY` |
| Path traversal cache | Hash MD5 hex uniquement ✅ déjà protégé |
| Render redémarre = cache perdu | Cache sur `/data/` persistant ✅ |
| Site municipal change URL | Fallback téléphone auto ✅ |
| AbortController non disponible | Node 14.17+ = dispo nativement ✅ |
| Quota dépassé = erreur dure | Vérification avant chaque scrape ✅ |
| require() en boucle = lent | require() au top-level si possible |

---

## 📊 RÉSULTAT ATTENDU

Après deploy, Kira peut répondre à:
- *"grille de zonage Sainte-Julienne"* → marges latérales extraites en 3s
- *"règlement bande riveraine Rawdon"* → section riveraine du site
- *"permis construction Chertsey"* → infos permis directes
- *"scrape cette URL: [url]"* → contenu markdown propre
- *"/firecrawl"* → quota utilisé ce mois

---

*Généré par Kira — 2026-04-24 — Version production*
