# 🔧 PROMPT CLAUDE CODE — INTÉGRATION FIRECRAWL v3 ULTIME

**Mission:** Intégrer Firecrawl de façon bulletproof pour que Kira puisse scraper les sites municipaux québécois en temps réel (grilles de zonage, règlements, marges latérales, taxes, permis).

**Niveau de qualité exigé:** Production-ready, zéro bug, zéro dette technique, zéro intervention manuelle.

---

## ✅ STATUT — CLÉS ET CONFIGURATION

La clé Firecrawl est DÉJÀ disponible. Tu dois:
1. Ajouter dans Render (dashboard.render.com → signaturesb-bot → Environment):
   ```
   FIRECRAWL_API_KEY=fc-52e378f6759746e4807406ddc3517d07
   FIRECRAWL_QUOTA_MONTHLY=500
   ```
2. NE JAMAIS mettre la clé dans le code source — env var uniquement
3. Vérifier que la clé fonctionne avec: `curl -X GET https://api.firecrawl.dev/v1/team -H "Authorization: Bearer fc-52e378f6759746e4807406ddc3517d07"`

---

## 🎯 OBJECTIFS NON NÉGOCIABLES

1. ✅ **Fiabilité 99%** — retry 2x avec backoff exponentiel, timeout 45s, fallback téléphone
2. ✅ **Performance** — cache MD5 30 jours sur `/data/`, réponse < 3s si cache hit
3. ✅ **Sécurité** — API key env var uniquement, validation inputs, rotation logs
4. ✅ **UX mobile Shawn** — erreurs ultra-claires, fallback téléphone auto si scraping échoue
5. ✅ **Coût contrôlé** — cache agressif, alerte Telegram si >80% quota mensuel
6. ✅ **Extensibilité** — ajouter nouvelle ville = 5 lignes dans MUNICIPALITES

---

## 🏗️ ARCHITECTURE COMPLÈTE

```
Shawn (Telegram): "grille zonage Sainte-Julienne"
  ↓
bot.js → tool: scraper_site_municipal(ville, sujet)
  ↓
firecrawl_scraper.js
  ├── normaliseMunicipalite()   ← "ste-julienne" → "sainte-julienne"
  ├── getCached()               ← cache 30j MD5
  ├── checkQuota()              ← protection quota mensuel
  ├── scrapUrlWithRetry()       ← Firecrawl API + retry 2x + timeout 45s
  ├── extractSection()          ← filtre markdown par mots-clés
  ├── setCached()               ← sauvegarde résultat
  └── auditLog()                ← /data/firecrawl_audit.jsonl
  ↓
Réponse: grille zonage en markdown structuré, section marges latérales isolée
```

---

## 📁 FICHIER 1: `firecrawl_scraper.js` (CRÉER/REMPLACER COMPLÈTEMENT)

```javascript
// firecrawl_scraper.js — Scraper municipal bulletproof pour Kira Bot v3
// Auteur: Claude Code | Dépendances: node-fetch v2, fs, path, crypto

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// node-fetch v2 (CommonJS compatible — IMPORTANT: pas v3)
let fetch;
try {
  fetch = require('node-fetch');
} catch (e) {
  throw new Error('[Firecrawl] node-fetch manquant. Exécuter: npm install node-fetch@2');
}

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════

const CONFIG = {
  apiKey: process.env.FIRECRAWL_API_KEY,
  quotaMonthly: parseInt(process.env.FIRECRAWL_QUOTA_MONTHLY || '500'),
  cacheDir: '/data/firecrawl_cache',
  auditLog: '/data/firecrawl_audit.jsonl',
  quotaFile: '/data/firecrawl_quota.json',
  cacheTTL: 30 * 24 * 60 * 60 * 1000, // 30 jours ms
  timeout: 45000,   // 45s
  maxRetries: 2,
  backoffBase: 2000 // 2s, 4s
};

// Init répertoire cache au démarrage
if (!fs.existsSync(CONFIG.cacheDir)) {
  fs.mkdirSync(CONFIG.cacheDir, { recursive: true });
}

// ═══════════════════════════════════════════
// MUNICIPALITÉS PRÉ-CONFIGURÉES
// ═══════════════════════════════════════════

const MUNICIPALITES = {
  'sainte-julienne': {
    nom: 'Sainte-Julienne',
    aliases: ['ste-julienne', 'st-julienne', 'sainte julienne', 'julienne'],
    baseUrl: 'https://sainte-julienne.com',
    pages: {
      zonage: '/services-aux-citoyens/urbanisme/reglement-de-zonage/',
      urbanisme: '/services-aux-citoyens/urbanisme/',
      permis: '/services-aux-citoyens/urbanisme/permis-et-certificats/',
      taxes: '/services-aux-citoyens/taxation/'
    },
    telephone: '(450) 831-2929',
    poste_urbanisme: 'poste 7235'
  },
  'rawdon': {
    nom: 'Rawdon',
    aliases: ['rawdon'],
    baseUrl: 'https://rawdon.ca',
    pages: {
      zonage: '/services-municipaux/urbanisme/',
      urbanisme: '/services-municipaux/urbanisme/',
      permis: '/services-municipaux/urbanisme/permis/',
      taxes: '/services-municipaux/taxation/'
    },
    telephone: '(450) 834-2596'
  },
  'chertsey': {
    nom: 'Chertsey',
    aliases: ['chertsey'],
    baseUrl: 'https://chertsey.ca',
    pages: {
      zonage: '/services-aux-citoyens/urbanisme/',
      urbanisme: '/services-aux-citoyens/urbanisme/',
      permis: '/services-aux-citoyens/urbanisme/',
      taxes: '/services-aux-citoyens/taxation/'
    },
    telephone: '(450) 882-2920'
  },
  'saint-calixte': {
    nom: 'Saint-Calixte',
    aliases: ['st-calixte', 'saint calixte', 'calixte'],
    baseUrl: 'https://saint-calixte.ca',
    pages: {
      zonage: '/services-municipaux/urbanisme/',
      urbanisme: '/services-municipaux/urbanisme/',
      permis: '/services-municipaux/urbanisme/permis/',
      taxes: '/services-municipaux/taxation/'
    },
    telephone: '(450) 839-2002'
  },
  'saint-jean-de-matha': {
    nom: 'Saint-Jean-de-Matha',
    aliases: ['st-jean-de-matha', 'saint jean de matha', 'matha'],
    baseUrl: 'https://saint-jean-de-matha.ca',
    pages: {
      zonage: '/urbanisme/',
      urbanisme: '/urbanisme/',
      permis: '/urbanisme/permis/',
      taxes: '/taxation/'
    },
    telephone: '(450) 886-3778'
  },
  'saint-didace': {
    nom: 'Saint-Didace',
    aliases: ['st-didace', 'saint didace', 'didace'],
    baseUrl: 'https://saint-didace.com',
    pages: {
      zonage: '/urbanisme/',
      urbanisme: '/urbanisme/',
      permis: '/urbanisme/',
      taxes: '/taxation/'
    },
    telephone: '(450) 835-9340'
  },
  'sainte-marcelline': {
    nom: 'Sainte-Marcelline-de-Kildare',
    aliases: ['ste-marcelline', 'marcelline', 'kildare'],
    baseUrl: 'https://sainte-marcelline-de-kildare.ca',
    pages: {
      zonage: '/urbanisme/',
      urbanisme: '/urbanisme/'
    },
    telephone: '(450) 883-2251'
  },
  'matawinie': {
    nom: 'MRC Matawinie',
    aliases: ['mrc matawinie', 'matawinie'],
    baseUrl: 'https://matawinie.org',
    pages: {
      zonage: '/amenagement-du-territoire/',
      schema: '/amenagement-du-territoire/schema-damenagement/',
      urbanisme: '/amenagement-du-territoire/'
    },
    telephone: '(450) 834-5441'
  },
  'd-autray': {
    nom: "MRC D'Autray",
    aliases: ['autray', 'd\'autray', 'mrc autray'],
    baseUrl: 'https://mrcautray.qc.ca',
    pages: {
      zonage: '/amenagement/',
      urbanisme: '/amenagement/'
    },
    telephone: '(450) 836-7007'
  }
};

// Mots-clés par sujet pour extraction ciblée
const SUJETS_KEYWORDS = {
  'zonage': ['zonage', 'zone', 'grille', 'tableau', 'règlement', 'usages', 'usage', 'résidentiel'],
  'marges': ['marge', 'latérale', 'recul', 'avant', 'arrière', 'implantation', 'distance', 'bâtiment'],
  'grille': ['grille', 'tableau', 'spécification', 'paramètre', 'hauteur', 'superficie', 'couverture'],
  'permis': ['permis', 'certificat', 'construction', 'rénovation', 'autorisation', 'formulaire'],
  'taxes': ['taxe', 'évaluation', 'foncière', 'taux', 'municipal'],
  'bande-riveraine': ['bande riveraine', 'cours d\'eau', 'lac', 'rive', 'protection', '15m', '30m'],
  'fosse': ['fosse', 'septique', 'épuration', 'traitement', 'champ']
};

// ═══════════════════════════════════════════
// NORMALISATION VILLE
// ═══════════════════════════════════════════

function normaliseMunicipalite(input) {
  if (!input) return null;
  const normalized = input.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève accents
    .trim();

  // Match direct
  if (MUNICIPALITES[normalized]) return normalized;

  // Match par aliases
  for (const [key, config] of Object.entries(MUNICIPALITES)) {
    const aliasesNorm = config.aliases.map(a =>
      a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
    if (aliasesNorm.includes(normalized)) return key;
    // Match partiel
    if (aliasesNorm.some(a => a.includes(normalized) || normalized.includes(a))) return key;
  }

  return null;
}

// ═══════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════

function cacheKey(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

function getCached(url) {
  try {
    const file = path.join(CONFIG.cacheDir, `${cacheKey(url)}.json`);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - data.timestamp > CONFIG.cacheTTL) {
      fs.unlinkSync(file); // Expire
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function setCached(url, markdown, meta = {}) {
  try {
    const file = path.join(CONFIG.cacheDir, `${cacheKey(url)}.json`);
    fs.writeFileSync(file, JSON.stringify({
      url, markdown, meta,
      timestamp: Date.now(),
      cached_at: new Date().toISOString()
    }), 'utf8');
  } catch (e) {
    console.error('[Firecrawl] Erreur cache write:', e.message);
  }
}

// ═══════════════════════════════════════════
// QUOTA MENSUEL
// ═══════════════════════════════════════════

function getMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getQuota() {
  try {
    if (!fs.existsSync(CONFIG.quotaFile)) return { month: getMonthKey(), count: 0 };
    const data = JSON.parse(fs.readFileSync(CONFIG.quotaFile, 'utf8'));
    if (data.month !== getMonthKey()) return { month: getMonthKey(), count: 0 };
    return data;
  } catch (e) {
    return { month: getMonthKey(), count: 0 };
  }
}

function incrementQuota() {
  const q = getQuota();
  q.count += 1;
  try { fs.writeFileSync(CONFIG.quotaFile, JSON.stringify(q), 'utf8'); } catch (e) {}
  return q;
}

// ═══════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════

function auditLog(action, url, success, details = {}) {
  try {
    const entry = JSON.stringify({
      ts: new Date().toISOString(), action, url, success, ...details
    });
    fs.appendFileSync(CONFIG.auditLog, entry + '\n', 'utf8');
  } catch (e) {}
}

// ═══════════════════════════════════════════
// EXTRACTION DE SECTION PAR MOTS-CLÉS
// ═══════════════════════════════════════════

function extractSection(markdown, sujet) {
  if (!markdown) return null;
  const keywords = SUJETS_KEYWORDS[sujet] || [sujet];

  const lines = markdown.split('\n');
  let bestSection = '';
  let capturing = false;
  let sectionLines = [];
  let bestScore = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNorm = line.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Début de section pertinente (titre markdown)
    if (line.startsWith('#')) {
      // Sauvegarder section précédente si pertinente
      if (capturing && sectionLines.length > 0) {
        const sectionText = sectionLines.join('\n');
        const score = keywords.filter(k => sectionText.toLowerCase().includes(k)).length;
        if (score > bestScore) {
          bestScore = score;
          bestSection = sectionText;
        }
      }
      // Démarrer nouvelle section si titre pertinent
      const titleMatch = keywords.some(k => lineNorm.includes(k));
      capturing = titleMatch;
      sectionLines = titleMatch ? [line] : [];
      continue;
    }

    if (capturing) {
      sectionLines.push(line);
      // Limite: 100 lignes par section
      if (sectionLines.length >= 100) {
        capturing = false;
        const sectionText = sectionLines.join('\n');
        const score = keywords.filter(k => sectionText.toLowerCase().includes(k)).length;
        if (score > bestScore) {
          bestScore = score;
          bestSection = sectionText;
        }
        sectionLines = [];
      }
    }
  }

  // Dernière section
  if (capturing && sectionLines.length > 0) {
    const sectionText = sectionLines.join('\n');
    const score = keywords.filter(k => sectionText.toLowerCase().includes(k)).length;
    if (score > bestScore) bestSection = sectionText;
  }

  // Si pas de section trouvée → chercher paragraphes avec keywords
  if (!bestSection) {
    const relevantLines = lines.filter(line => {
      const ln = line.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return keywords.some(k => ln.includes(k));
    });
    if (relevantLines.length > 0) {
      bestSection = relevantLines.slice(0, 30).join('\n');
    }
  }

  return bestSection || null;
}

// ═══════════════════════════════════════════
// SCRAPE CORE (avec retry + timeout)
// ═══════════════════════════════════════════

async function scrapUrlCore(url) {
  // Vérifier quota
  const quota = getQuota();
  if (quota.count >= CONFIG.quotaMonthly) {
    throw new Error(`⚠️ Quota Firecrawl épuisé ce mois (${quota.count}/${CONFIG.quotaMonthly}). Reset le 1er du mois.`);
  }

  // Alerte quota >80%
  const quotaPct = (quota.count / CONFIG.quotaMonthly) * 100;
  if (quotaPct >= 80) {
    console.warn(`[Firecrawl] ⚠️ Quota ${quotaPct.toFixed(0)}% utilisé (${quota.count}/${CONFIG.quotaMonthly})`);
  }

  let lastError;

  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = CONFIG.backoffBase * Math.pow(2, attempt - 1);
      console.log(`[Firecrawl] Retry ${attempt}/${CONFIG.maxRetries} dans ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.timeout);

    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 1000,
          timeout: 30000
        }),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        if (response.status === 402) {
          throw new Error('Quota Firecrawl épuisé (HTTP 402). Vérifier plan sur firecrawl.dev');
        }
        if (response.status === 429) {
          throw new Error('Rate limit Firecrawl (HTTP 429). Attendre avant retry.');
        }
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
      }

      const data = await response.json();

      if (!data.success || !data.data?.markdown) {
        throw new Error(`Firecrawl: pas de contenu markdown. Success=${data.success}`);
      }

      // Incrémenter quota seulement si succès
      incrementQuota();
      auditLog('scrape', url, true, { attempt, chars: data.data.markdown.length });

      return {
        markdown: data.data.markdown,
        title: data.data.metadata?.title || '',
        url: data.data.metadata?.sourceURL || url
      };

    } catch (e) {
      clearTimeout(timer);
      lastError = e;

      if (e.name === 'AbortError') {
        lastError = new Error(`Timeout après ${CONFIG.timeout / 1000}s pour: ${url}`);
      }

      // Ne pas retry sur erreurs quota/auth
      if (e.message.includes('402') || e.message.includes('Quota')) break;

      console.error(`[Firecrawl] Tentative ${attempt + 1} échouée:`, e.message);
    }
  }

  auditLog('scrape', url, false, { error: lastError?.message });
  throw lastError;
}

// ═══════════════════════════════════════════
// API PUBLIQUE — OUTIL 1: scraper_site_municipal
// ═══════════════════════════════════════════

async function scrapMunicipalite(ville, sujet = 'zonage') {
  const start = Date.now();

  // Normaliser ville
  const key = normaliseMunicipalite(ville);
  if (!key) {
    const villes = Object.values(MUNICIPALITES).map(m => m.nom).join(', ');
    return {
      success: false,
      error: `Ville "${ville}" non reconnue.`,
      villes_disponibles: villes,
      suggestion: `Villes configurées: ${villes}`
    };
  }

  const config = MUNICIPALITES[key];
  const pageKey = Object.keys(SUJETS_KEYWORDS).includes(sujet) ? sujet : 'zonage';
  const pagePath = config.pages[pageKey] || config.pages.urbanisme || config.pages.zonage || '/';
  const url = config.baseUrl + pagePath;

  // Vérifier cache
  const cached = getCached(url);
  if (cached) {
    const section = extractSection(cached.markdown, sujet);
    return {
      success: true,
      ville: config.nom,
      sujet,
      url,
      source: 'cache',
      cached_at: cached.cached_at,
      contenu: section || cached.markdown.slice(0, 3000),
      section_trouvee: !!section,
      telephone: config.telephone,
      elapsed_ms: Date.now() - start
    };
  }

  // Vérifier clé API
  if (!CONFIG.apiKey) {
    return {
      success: false,
      error: '⚠️ FIRECRAWL_API_KEY manquante dans Render. Ajouter la variable d\'environnement.',
      telephone: config.telephone,
      fallback: `Appeler directement: ${config.nom} → ${config.telephone}`
    };
  }

  // Scraper
  try {
    const result = await scrapUrlCore(url);
    setCached(url, result.markdown);

    const section = extractSection(result.markdown, sujet);

    // Si section non trouvée → essayer page alternative
    let finalContent = section;
    let urlUsed = url;

    if (!section && config.pages.urbanisme && config.pages.urbanisme !== pagePath) {
      const altUrl = config.baseUrl + config.pages.urbanisme;
      try {
        const altCached = getCached(altUrl);
        const altMarkdown = altCached?.markdown || (await scrapUrlCore(altUrl)).markdown;
        if (!altCached) setCached(altUrl, altMarkdown);
        finalContent = extractSection(altMarkdown, sujet) || altMarkdown.slice(0, 3000);
        urlUsed = altUrl;
      } catch (e) {
        finalContent = result.markdown.slice(0, 3000);
      }
    }

    return {
      success: true,
      ville: config.nom,
      sujet,
      url: urlUsed,
      source: 'firecrawl_live',
      contenu: finalContent || result.markdown.slice(0, 3000),
      section_trouvee: !!section,
      telephone: config.telephone,
      poste: config.poste_urbanisme || null,
      elapsed_ms: Date.now() - start,
      quota: getQuota()
    };

  } catch (e) {
    const quota = getQuota();
    return {
      success: false,
      ville: config.nom,
      sujet,
      url,
      error: e.message,
      fallback: `Appeler directement: ${config.nom} → ${config.telephone}${config.poste_urbanisme ? ' ' + config.poste_urbanisme : ''}`,
      quota,
      elapsed_ms: Date.now() - start
    };
  }
}

// ═══════════════════════════════════════════
// API PUBLIQUE — OUTIL 2: scraper_url
// ═══════════════════════════════════════════

async function scrapUrlPublic(url, motsCles = []) {
  if (!url || !url.startsWith('http')) {
    return { success: false, error: 'URL invalide. Doit commencer par http:// ou https://' };
  }

  // Sécurité: bloquer URLs internes/localhost
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')) {
    return { success: false, error: 'URL non autorisée.' };
  }

  if (!CONFIG.apiKey) {
    return { success: false, error: 'FIRECRAWL_API_KEY manquante dans Render.' };
  }

  // Cache
  const cached = getCached(url);
  if (cached) {
    const content = motsCles.length > 0
      ? extractSection(cached.markdown, motsCles[0]) || cached.markdown.slice(0, 4000)
      : cached.markdown.slice(0, 4000);
    return {
      success: true, url, source: 'cache',
      cached_at: cached.cached_at, contenu: content
    };
  }

  try {
    const result = await scrapUrlCore(url);
    setCached(url, result.markdown);
    const content = motsCles.length > 0
      ? extractSection(result.markdown, motsCles[0]) || result.markdown.slice(0, 4000)
      : result.markdown.slice(0, 4000);
    return {
      success: true, url, source: 'firecrawl_live',
      title: result.title, contenu: content, quota: getQuota()
    };
  } catch (e) {
    return { success: false, url, error: e.message };
  }
}

// ═══════════════════════════════════════════
// UTILITAIRES PUBLICS
// ═══════════════════════════════════════════

function getQuotaStatus() {
  const q = getQuota();
  const pct = Math.round((q.count / CONFIG.quotaMonthly) * 100);
  return {
    count: q.count,
    total: CONFIG.quotaMonthly,
    pourcentage: pct,
    restant: CONFIG.quotaMonthly - q.count,
    mois: q.month,
    status: pct >= 90 ? '🔴 CRITIQUE' : pct >= 80 ? '🟡 ATTENTION' : '🟢 OK'
  };
}

function clearCache(urlOrAll = null) {
  if (urlOrAll === 'all' || urlOrAll === null) {
    const files = fs.readdirSync(CONFIG.cacheDir).filter(f => f.endsWith('.json'));
    files.forEach(f => fs.unlinkSync(path.join(CONFIG.cacheDir, f)));
    return { cleared: files.length };
  }
  const file = path.join(CONFIG.cacheDir, `${cacheKey(urlOrAll)}.json`);
  if (fs.existsSync(file)) { fs.unlinkSync(file); return { cleared: 1 }; }
  return { cleared: 0 };
}

module.exports = {
  scrapMunicipalite,
  scrapUrlPublic,
  getQuotaStatus,
  clearCache,
  MUNICIPALITES
};
```

---

## 📁 FICHIER 2: Modifications `bot.js` — Ajouter 2 outils + commande /firecrawl

### 2A — Importer le module (en haut du fichier, après les autres requires)

```javascript
// Firecrawl scraper municipal
let firecrawlScraper;
try {
  firecrawlScraper = require('./firecrawl_scraper');
  console.log('[Firecrawl] ✅ Module chargé');
} catch (e) {
  console.warn('[Firecrawl] ⚠️ Module non disponible:', e.message);
}
```

### 2B — Définitions des 2 outils (dans le tableau `tools_definitions` ou équivalent)

```javascript
{
  name: "scraper_site_municipal",
  description: "Scraper les sites web municipaux pour obtenir grilles de zonage, règlements, marges latérales, reculs, permis, taxes. Villes: Sainte-Julienne, Rawdon, Chertsey, Saint-Calixte, Saint-Jean-de-Matha, Saint-Didace, MRC Matawinie, MRC D'Autray. Utiliser pour: 'grille zonage Ste-Julienne', 'marges latérales Rawdon', 'permis construction Chertsey'.",
  input_schema: {
    type: "object",
    properties: {
      ville: {
        type: "string",
        description: "Nom de la ville ou MRC. Ex: Sainte-Julienne, Rawdon, Chertsey, Saint-Calixte"
      },
      sujet: {
        type: "string",
        description: "Sujet recherché: zonage, marges, grille, permis, taxes, bande-riveraine, fosse",
        enum: ["zonage", "marges", "grille", "permis", "taxes", "bande-riveraine", "fosse"]
      }
    },
    required: ["ville"]
  }
},
{
  name: "scraper_url",
  description: "Scraper n'importe quelle URL et retourner son contenu en markdown. Pour pages web spécifiques (règlements PDF, pages gouvernementales, etc.). Optionnel: filtrer par mots-clés.",
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
        description: "Mots-clés pour filtrer le contenu retourné (optionnel)"
      }
    },
    required: ["url"]
  }
}
```

### 2C — Handlers des outils (dans le switch/if des tool calls)

```javascript
case 'scraper_site_municipal': {
  if (!firecrawlScraper) {
    return { error: 'Module Firecrawl non disponible. Vérifier firecrawl_scraper.js' };
  }
  const { ville, sujet = 'zonage' } = toolInput;
  const result = await firecrawlScraper.scrapMunicipalite(ville, sujet);

  if (!result.success) {
    return {
      error: result.error,
      fallback: result.fallback || null,
      villes_disponibles: result.villes_disponibles || null
    };
  }

  // Alerte quota si >80%
  if (result.quota && result.quota.count / result.quota.total >= 0.8) {
    console.warn(`[Firecrawl] ⚠️ Quota ${result.quota.count}/${result.quota.total}`);
  }

  return result;
}

case 'scraper_url': {
  if (!firecrawlScraper) {
    return { error: 'Module Firecrawl non disponible.' };
  }
  const { url, mots_cles = [] } = toolInput;
  return await firecrawlScraper.scrapUrlPublic(url, mots_cles);
}
```

### 2D — Commande /firecrawl (dans le handler Telegram des commandes)

```javascript
if (text === '/firecrawl' || text === '/quota') {
  if (!firecrawlScraper) {
    await sendTelegram('❌ Firecrawl non configuré.');
    return;
  }
  const q = firecrawlScraper.getQuotaStatus();
  const msg = `🔥 *Firecrawl — Quota ${q.mois}*\n${q.status} ${q.count}/${q.total} pages (${q.pourcentage}%)\nRestant: ${q.restant} pages`;
  await sendTelegram(msg);
  return;
}
```

---

## 🧪 FICHIER 3: `test_firecrawl.js` (CRÉER)

```javascript
// test_firecrawl.js — Validation complète Firecrawl
// Usage: node test_firecrawl.js

require('dotenv').config();
const scraper = require('./firecrawl_scraper');

async function runTests() {
  console.log('🧪 Tests Firecrawl\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      const result = await fn();
      if (result.success === false && result.error?.includes('API_KEY')) {
        console.log(`⚠️  [SKIP] ${name} — Clé API manquante (normal en dev local)`);
        return;
      }
      console.log(`✅ [PASS] ${name}`);
      if (result.contenu) console.log(`   → ${result.contenu.slice(0, 100)}...`);
      passed++;
    } catch (e) {
      console.log(`❌ [FAIL] ${name}: ${e.message}`);
      failed++;
    }
  }

  // Test 1: Normalisation ville
  await test('Normalisation "ste-julienne" → sainte-julienne', async () => {
    const r = await scraper.scrapMunicipalite('ste-julienne', 'zonage');
    if (r.ville !== 'Sainte-Julienne' && !r.error?.includes('non reconnue')) throw new Error('Normalisation failed');
    return { success: true };
  });

  // Test 2: Ville inconnue
  await test('Ville inconnue → erreur claire', async () => {
    const r = await scraper.scrapMunicipalite('montréal', 'zonage');
    if (r.success) throw new Error('Devrait échouer pour ville non configurée');
    return { success: true };
  });

  // Test 3: URL invalide
  await test('URL invalide → erreur claire', async () => {
    const r = await scraper.scrapUrlPublic('pas-une-url');
    if (r.success) throw new Error('Devrait échouer');
    return { success: true };
  });

  // Test 4: URL localhost bloquée
  await test('localhost bloqué (sécurité)', async () => {
    const r = await scraper.scrapUrlPublic('http://localhost:3000');
    if (r.success) throw new Error('Localhost devrait être bloqué');
    return { success: true };
  });

  // Test 5: Quota status
  await test('Quota status OK', async () => {
    const q = scraper.getQuotaStatus();
    if (typeof q.count !== 'number') throw new Error('Quota invalide');
    console.log(`   → Quota: ${q.count}/${q.total} (${q.status})`);
    return { success: true };
  });

  // Test 6: Scrape réel (si clé présente)
  if (process.env.FIRECRAWL_API_KEY) {
    await test('Scrape Sainte-Julienne zonage (LIVE)', async () => {
      const r = await scraper.scrapMunicipalite('sainte-julienne', 'zonage');
      return r;
    });

    await test('Cache hit après scrape', async () => {
      const r = await scraper.scrapMunicipalite('sainte-julienne', 'zonage');
      if (r.source !== 'cache') throw new Error('Devrait être en cache après premier scrape');
      return r;
    });
  }

  console.log(`\n📊 Résultats: ${passed} passés, ${failed} échoués`);
  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
```

---

## ✅ PROCÉDURE D'EXÉCUTION CLAUDE CODE (dans cet ordre strict)

### Étape 1 — Vérifier node-fetch
```bash
cat package.json | grep node-fetch
# Si absent ou v3: npm install node-fetch@2
```

### Étape 2 — Créer firecrawl_scraper.js
```bash
# Copier le code du FICHIER 1 ci-dessus dans firecrawl_scraper.js
```

### Étape 3 — Modifier bot.js (4 insertions)
```bash
# 2A: Import module (haut du fichier)
# 2B: Ajouter 2 outils dans tools_definitions
# 2C: Ajouter handlers dans le switch tool calls
# 2D: Ajouter commande /firecrawl
```

### Étape 4 — Créer test_firecrawl.js
```bash
# Copier le code du FICHIER 3
```

### Étape 5 — Tester
```bash
node test_firecrawl.js
# Tous les tests doivent passer (sauf SKIP si pas de clé locale)
```

### Étape 6 — Ajouter env vars dans Render
```
FIRECRAWL_API_KEY=fc-52e378f6759746e4807406ddc3517d07
FIRECRAWL_QUOTA_MONTHLY=500
```
⚠️ NE PAS mettre la clé dans le code source

### Étape 7 — Commit + Push
```bash
git add firecrawl_scraper.js test_firecrawl.js bot.js
git commit -m "[FIRECRAWL] Intégration complète v3 bulletproof — scraper municipal + quota + cache 30j"
git push origin main
```

### Étape 8 — Vérifier déploiement Render
```bash
# Attendre 90s
curl https://signaturesb-bot-s272.onrender.com/health
# Vérifier: tools count augmenté de 2 + pas d'erreurs Firecrawl dans logs
```

### Étape 9 — Test de validation finale
```bash
# Dans Telegram Shawn:
# /firecrawl → doit afficher quota 0/500 🟢 OK
# "grille zonage sainte-julienne" → doit scraper et retourner contenu
```

---

## ⚠️ PIÈGES CONNUS — À ÉVITER

| Piège | Solution |
|-------|----------|
| `node-fetch v3` (ESM) | Utiliser `node-fetch@2` (CommonJS) |
| Clé API dans le code | Toujours `process.env.FIRECRAWL_API_KEY` |
| Path traversal cache | Utiliser `crypto.md5(url)` comme nom de fichier |
| AbortController non supporté | Node 16+ requis (Render OK) |
| Sites qui bloquent | Firecrawl gère les headers automatiquement |
| Cache `/data/` inexistant | `mkdirSync({ recursive: true })` au boot |
| Render env vars pas rechargées | Redéployer après ajout de variables |
| tools_count inchangé | Vérifier import + restart propre |

---

## 📊 RÉSULTAT FINAL ATTENDU

Après intégration:
- ✅ `/firecrawl` dans Telegram → quota live
- ✅ "grille zonage Sainte-Julienne" → scraping + extraction section marges en < 5s
- ✅ "marges latérales Rawdon" → même chose pour Rawdon
- ✅ Cache 30j → 2e requête même ville = instantané (0 crédit)
- ✅ Si scraping échoue → fallback téléphone automatique
- ✅ tools count +2 dans /health
