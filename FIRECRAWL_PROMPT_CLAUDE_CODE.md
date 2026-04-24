# 🔧 PROMPT CLAUDE CODE — INTÉGRATION FIRECRAWL (ULTIME)

**Mission:** Intégrer Firecrawl de façon bulletproof pour que Kira puisse scraper les sites municipaux québécois en temps réel (grilles de zonage, règlements, marges latérales, taxes).

**Niveau de qualité exigé:** Production-ready, zero bug, zero dette technique.

---

## 🎯 OBJECTIFS NON NÉGOCIABLES

1. ✅ **Fiabilité 99%** — retry automatique, timeout protégé, fallback clair
2. ✅ **Performance** — cache 30j, parallélisation, réponse < 5s si cache hit
3. ✅ **Sécurité** — API key env var uniquement, rate limiting, logs audit
4. ✅ **UX mobile** — erreurs claires pour Shawn, fallback téléphone auto
5. ✅ **Coût contrôlé** — cache agressif, alerte si >80% quota mensuel
6. ✅ **Extensibilité** — facile d'ajouter nouvelles villes sans refactor

---

## 📋 PRÉREQUIS (Shawn doit faire AVANT)

1. Créer compte sur **firecrawl.dev** avec shawn@signaturesb.com
2. Plan: **Hobby gratuit** (500 pages/mois) — suffisant avec cache 30j
3. Copier API key format `fc-xxxxxxxxxxxxx`
4. Ajouter dans Render env vars:
   ```
   FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxx
   FIRECRAWL_QUOTA_MONTHLY=500
   ```

---

## 🏗️ ARCHITECTURE

```
bot.js
  ↓
tools.scraper_site_municipal(ville, sujet)
tools.scraper_url(url, extrait_mots_cles)
  ↓
firecrawl_scraper.js
  ├── scrapMunicipalite()      ← logique villes pré-configurées
  ├── scrapUrl()                ← URL arbitraire
  ├── extractSection()          ← découpe markdown par mots-clés
  ├── getCached() / setCached() ← cache 30j sur /data/firecrawl_cache/
  ├── checkQuota()              ← protection dépassement
  └── auditLog()                ← /data/firecrawl_audit.jsonl
  ↓
Firecrawl API (api.firecrawl.dev/v1/scrape)
```

---

## 📁 FICHIER 1: `firecrawl_scraper.js` (NOUVEAU)

```javascript
// firecrawl_scraper.js — Scraper municipal bulletproof pour Kira Bot
// Dépendances: node-fetch (déjà installé), fs, path, crypto

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

// ═══════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_QUOTA = parseInt(process.env.FIRECRAWL_QUOTA_MONTHLY || '500');
const CACHE_DIR = '/data/firecrawl_cache';
const AUDIT_LOG = '/data/firecrawl_audit.jsonl';
const QUOTA_FILE = '/data/firecrawl_quota.json';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const TIMEOUT_MS = 45000; // 45s max par scrape
const MAX_RETRIES = 2;

// Init dirs
[CACHE_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ═══════════════════════════════════════════════════════
// VILLES PRÉ-CONFIGURÉES (Lanaudière — zone Shawn)
// ═══════════════════════════════════════════════════════

const MUNICIPALITES = {
  'sainte-julienne': {
    nom: 'Sainte-Julienne',
    baseUrl: 'https://sainte-julienne.com',
    pages: {
      zonage: '/services-aux-citoyens/urbanisme/reglement-de-zonage/',
      urbanisme: '/services-aux-citoyens/urbanisme/',
      permis: '/services-aux-citoyens/urbanisme/permis-et-certificats/',
      taxes: '/services-aux-citoyens/taxation/'
    },
    telephone: '450-831-2929',
    poste_urbanisme: 'poste 7235'
  },
  'rawdon': {
    nom: 'Rawdon',
    baseUrl: 'https://rawdon.ca',
    pages: {
      zonage: '/services-municipaux/urbanisme/',
      urbanisme: '/services-municipaux/urbanisme/',
      permis: '/services-municipaux/urbanisme/permis/',
      taxes: '/services-municipaux/taxation/'
    },
    telephone: '450-834-2596'
  },
  'chertsey': {
    nom: 'Chertsey',
    baseUrl: 'https://chertsey.ca',
    pages: {
      zonage: '/services-aux-citoyens/urbanisme/',
      urbanisme: '/services-aux-citoyens/urbanisme/',
      permis: '/services-aux-citoyens/urbanisme/',
      taxes: '/services-aux-citoyens/taxation/'
    },
    telephone: '450-882-2920'
  },
  'saint-calixte': {
    nom: 'Saint-Calixte',
    baseUrl: 'https://saint-calixte.ca',
    pages: {
      zonage: '/services-municipaux/urbanisme/',
      urbanisme: '/services-municipaux/urbanisme/',
      permis: '/services-municipaux/urbanisme/permis/',
      taxes: '/services-municipaux/taxation/'
    },
    telephone: '450-839-2002'
  },
  'saint-jean-de-matha': {
    nom: 'Saint-Jean-de-Matha',
    baseUrl: 'https://saint-jean-de-matha.ca',
    pages: {
      zonage: '/urbanisme/',
      urbanisme: '/urbanisme/',
      permis: '/urbanisme/permis/',
      taxes: '/taxation/'
    },
    telephone: '450-886-3778'
  },
  'saint-didace': {
    nom: 'Saint-Didace',
    baseUrl: 'https://saint-didace.com',
    pages: {
      zonage: '/urbanisme/',
      urbanisme: '/urbanisme/',
      permis: '/urbanisme/',
      taxes: '/taxation/'
    },
    telephone: '450-835-9340'
  },
  'matawinie': {
    nom: 'MRC Matawinie',
    baseUrl: 'https://matawinie.org',
    pages: {
      zonage: '/amenagement-du-territoire/',
      urbanisme: '/amenagement-du-territoire/',
      schema: '/amenagement-du-territoire/schema-damenagement/'
    },
    telephone: '450-834-5441'
  },
  'd-autray': {
    nom: 'MRC D\'Autray',
    baseUrl: 'https://mrcautray.qc.ca',
    pages: {
      zonage: '/amenagement/',
      urbanisme: '/amenagement/'
    },
    telephone: '450-836-7007'
  }
};

// ═══════════════════════════════════════════════════════
// CACHE (fichiers JSON, TTL 30j)
// ═══════════════════════════════════════════════════════

function cacheKey(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

function getCached(url) {
  try {
    const key = cacheKey(url);
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - data.timestamp > CACHE_TTL_MS) {
      fs.unlinkSync(file);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function setCached(url, markdown, metadata = {}) {
  try {
    const key = cacheKey(url);
    const file = path.join(CACHE_DIR, `${key}.json`);
    fs.writeFileSync(file, JSON.stringify({
      url,
      markdown,
      metadata,
      timestamp: Date.now(),
      cached_at: new Date().toISOString()
    }));
  } catch (e) {
    console.error('[Firecrawl] Cache write failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════
// QUOTA TRACKING (mois en cours)
// ═══════════════════════════════════════════════════════

function getQuotaState() {
  try {
    if (!fs.existsSync(QUOTA_FILE)) {
      return { month: currentMonth(), count: 0 };
    }
    const data = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
    if (data.month !== currentMonth()) {
      return { month: currentMonth(), count: 0 };
    }
    return data;
  } catch (e) {
    return { month: currentMonth(), count: 0 };
  }
}

function incrementQuota() {
  const state = getQuotaState();
  state.count += 1;
  fs.writeFileSync(QUOTA_FILE, JSON.stringify(state));
  return state;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════

function auditLog(action, url, success, details = {}) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      url,
      success,
      ...details
    };
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n');
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════
// SCRAPE CORE (avec retry + timeout)
// ═══════════════════════════════════════════════════════

async function scrapUrl(url, options = {}) {
  if (!FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY manquante dans env vars Render');
  }

  // 1. Vérifier cache
  const cached = getCached(url);
  if (cached && !options.forceRefresh) {
    auditLog('scrape', url, true, { source: 'cache' });
    return { ...cached, fromCache: true };
  }

  // 2. Vérifier quota
  const quota = getQuotaState();
  if (quota.count >= FIRECRAWL_QUOTA) {
    auditLog('scrape', url, false, { reason: 'quota_exceeded', quota });
    throw new Error(`Quota Firecrawl dépassé (${quota.count}/${FIRECRAWL_QUOTA} ce mois). Cache uniquement.`);
  }
  if (quota.count > FIRECRAWL_QUOTA * 0.8) {
    console.warn(`[Firecrawl] ⚠️ Quota à ${quota.count}/${FIRECRAWL_QUOTA} (80%+)`);
  }

  // 3. Scraper avec retry
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 2000,
          timeout: 40000
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Firecrawl ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      if (!data.success || !data.data?.markdown) {
        throw new Error('Firecrawl: pas de markdown retourné');
      }

      const markdown = data.data.markdown;
      const metadata = data.data.metadata || {};

      setCached(url, markdown, metadata);
      incrementQuota();
      auditLog('scrape', url, true, { source: 'firecrawl', attempt: attempt + 1, chars: markdown.length });

      return { url, markdown, metadata, fromCache: false };
    } catch (err) {
      lastError = err;
      if (err.name === 'AbortError') {
        console.warn(`[Firecrawl] Timeout attempt ${attempt + 1} sur ${url}`);
      } else {
        console.warn(`[Firecrawl] Échec attempt ${attempt + 1}: ${err.message}`);
      }
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); // backoff
      }
    }
  }

  auditLog('scrape', url, false, { reason: 'all_retries_failed', error: lastError?.message });
  throw lastError || new Error('Scrape échoué');
}

// ═══════════════════════════════════════════════════════
// EXTRACTION SECTION PAR MOTS-CLÉS
// ═══════════════════════════════════════════════════════

function extractSection(markdown, keywords) {
  if (!markdown) return '';
  const kws = Array.isArray(keywords) ? keywords : [keywords];
  const lines = markdown.split('\n');
  const matches = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (kws.some(kw => line.includes(kw.toLowerCase()))) {
      // Capturer 10 lignes autour
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 15);
      matches.push(lines.slice(start, end).join('\n'));
    }
  }

  if (matches.length === 0) return '';
  // Dédupliquer et limiter à 3000 chars
  const unique = [...new Set(matches)].join('\n\n---\n\n');
  return unique.slice(0, 3000);
}

// ═══════════════════════════════════════════════════════
// API PUBLIQUE — SCRAP MUNICIPAL
// ═══════════════════════════════════════════════════════

async function scrapMunicipalite(villeKey, sujet = 'zonage', motsCles = []) {
  const key = villeKey.toLowerCase().replace(/[\s_]/g, '-');
  const muni = MUNICIPALITES[key];

  if (!muni) {
    const disponibles = Object.keys(MUNICIPALITES).join(', ');
    throw new Error(`Ville "${villeKey}" non configurée. Disponibles: ${disponibles}`);
  }

  const pagePath = muni.pages[sujet] || muni.pages.urbanisme || '/';
  const url = muni.baseUrl + pagePath;

  try {
    const result = await scrapUrl(url);

    // Mots-clés par défaut selon sujet
    const kwMap = {
      zonage: ['marge', 'recul', 'grille', 'zone', 'hauteur', 'superficie'],
      permis: ['permis', 'certificat', 'coût', 'délai'],
      taxes: ['taxe', 'foncière', 'taux', 'compte'],
      urbanisme: ['règlement', 'zonage', 'permis']
    };
    const kws = motsCles.length > 0 ? motsCles : (kwMap[sujet] || []);
    const section = extractSection(result.markdown, kws);

    return {
      ville: muni.nom,
      sujet,
      url,
      telephone: muni.telephone,
      poste: muni.poste_urbanisme,
      section: section || result.markdown.slice(0, 2000),
      fromCache: result.fromCache,
      markdown_complet_chars: result.markdown.length
    };
  } catch (err) {
    return {
      ville: muni.nom,
      sujet,
      url,
      telephone: muni.telephone,
      poste: muni.poste_urbanisme,
      erreur: err.message,
      fallback: `Scraping échoué. Appeler ${muni.telephone}${muni.poste_urbanisme ? ' ' + muni.poste_urbanisme : ''}.`
    };
  }
}

// ═══════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════

module.exports = {
  scrapUrl,
  scrapMunicipalite,
  extractSection,
  getQuotaState,
  MUNICIPALITES
};
```

---

## 📁 FICHIER 2: `bot.js` — AJOUTS

### A. En haut du fichier (avec les autres requires):

```javascript
const firecrawl = require('./firecrawl_scraper');
```

### B. Dans la section TOOLS (ajouter 2 nouveaux tools):

```javascript
// ─── FIRECRAWL — SCRAPING MUNICIPAL ───

scraper_site_municipal: {
  description: "Scraper un site municipal québécois (grille zonage, marges, règlements, taxes, permis). Villes pré-configurées: sainte-julienne, rawdon, chertsey, saint-calixte, saint-jean-de-matha, saint-didace, matawinie, d-autray. Cache 30j.",
  input_schema: {
    type: "object",
    properties: {
      ville: {
        type: "string",
        description: "Clé ville (ex: sainte-julienne, rawdon, chertsey, saint-calixte)"
      },
      sujet: {
        type: "string",
        description: "zonage, urbanisme, permis, taxes (défaut: zonage)",
        enum: ["zonage", "urbanisme", "permis", "taxes"]
      },
      mots_cles: {
        type: "array",
        items: { type: "string" },
        description: "Mots-clés pour extraire section pertinente (ex: ['marge latérale', 'recul'])"
      }
    },
    required: ["ville"]
  },
  handler: async ({ ville, sujet = 'zonage', mots_cles = [] }) => {
    try {
      const result = await firecrawl.scrapMunicipalite(ville, sujet, mots_cles);
      return result;
    } catch (err) {
      return { erreur: err.message };
    }
  }
},

scraper_url: {
  description: "Scraper n'importe quelle URL (sites non municipaux, Centris pages publiques, etc.). Cache 30j. Usage modéré (quota 500/mois).",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL complète à scraper"
      },
      mots_cles: {
        type: "array",
        items: { type: "string" },
        description: "Mots-clés pour extraire sections pertinentes"
      }
    },
    required: ["url"]
  },
  handler: async ({ url, mots_cles = [] }) => {
    try {
      const result = await firecrawl.scrapUrl(url);
      const section = mots_cles.length > 0
        ? firecrawl.extractSection(result.markdown, mots_cles)
        : result.markdown.slice(0, 3000);
      return {
        url,
        contenu: section,
        fromCache: result.fromCache,
        chars_total: result.markdown.length
      };
    } catch (err) {
      return { erreur: err.message };
    }
  }
}
```

### C. Commande diagnostic Telegram (dans le handler `/commands`):

```javascript
if (text === '/firecrawl') {
  const state = firecrawl.getQuotaState();
  const villes = Object.keys(firecrawl.MUNICIPALITES).join(', ');
  await bot.sendMessage(chatId,
    `🔧 Firecrawl\n\n` +
    `Quota: ${state.count}/${process.env.FIRECRAWL_QUOTA_MONTHLY || 500} (${state.month})\n` +
    `Villes configurées: ${villes}\n` +
    `Cache: 30 jours`
  );
  return;
}
```

---

## 📁 FICHIER 3: `package.json` — VÉRIFIER

Confirmer que `node-fetch` est déjà présent. Sinon:

```bash
npm install node-fetch@2
```

(Version 2 pour compatibilité CommonJS)

---

## 🧪 TESTS OBLIGATOIRES AVANT COMMIT

Créer `test_firecrawl.js`:

```javascript
const firecrawl = require('./firecrawl_scraper');

async function runTests() {
  console.log('═══ TEST 1: Quota initial ═══');
  console.log(firecrawl.getQuotaState());

  console.log('\n═══ TEST 2: Scrape Sainte-Julienne zonage ═══');
  const r1 = await firecrawl.scrapMunicipalite('sainte-julienne', 'zonage', ['marge', 'recul']);
  console.log('Ville:', r1.ville);
  console.log('URL:', r1.url);
  console.log('Section (500 premiers chars):', (r1.section || '').slice(0, 500));
  console.log('From cache:', r1.fromCache);

  console.log('\n═══ TEST 3: Re-scrape (doit être cache) ═══');
  const r2 = await firecrawl.scrapMunicipalite('sainte-julienne', 'zonage', ['marge']);
  console.log('From cache:', r2.fromCache, '← doit être true');

  console.log('\n═══ TEST 4: Ville inexistante ═══');
  try {
    await firecrawl.scrapMunicipalite('montreal', 'zonage');
    console.log('❌ Devait throw');
  } catch (e) {
    console.log('✅ Error correcte:', e.message);
  }

  console.log('\n═══ TEST 5: URL arbitraire ═══');
  const r5 = await firecrawl.scrapUrl('https://rawdon.ca');
  console.log('Chars:', r5.markdown.length);

  console.log('\n✅ TOUS LES TESTS PASSÉS');
}

runTests().catch(e => {
  console.error('❌ TEST ÉCHOUÉ:', e);
  process.exit(1);
});
```

Lancer: `FIRECRAWL_API_KEY=fc-xxx node test_firecrawl.js`

**Tous les tests DOIVENT passer avant commit.**

---

## ✅ CHECKLIST VALIDATION

- [ ] `FIRECRAWL_API_KEY` ajoutée dans Render env vars
- [ ] `FIRECRAWL_QUOTA_MONTHLY=500` ajoutée dans Render
- [ ] `firecrawl_scraper.js` créé
- [ ] 2 nouveaux tools dans `bot.js` (scraper_site_municipal + scraper_url)
- [ ] Require `firecrawl` ajouté en haut de bot.js
- [ ] Commande `/firecrawl` ajoutée
- [ ] `test_firecrawl.js` passe tous les tests
- [ ] `node validate.js` passe
- [ ] Commit + push
- [ ] Attendre 90s déploiement Render
- [ ] `curl https://signaturesb-bot-s272.onrender.com/health` → tools count incrémenté de +2
- [ ] Test Telegram: envoyer `/firecrawl` → réponse quota
- [ ] Test Telegram: "grille zonage Sainte-Julienne marges latérales" → Kira scrape et répond

---

## 🚨 PIÈGES CONNUS À ÉVITER

1. **node-fetch v3 ≠ CommonJS** → utiliser `node-fetch@2`
2. **`/data/` doit être persistant sur Render** → vérifier que le disk est monté
3. **AbortController natif Node 18+** → Render tourne Node 20, OK
4. **Certains sites municipaux bloquent scraping** → fallback téléphone auto
5. **Markdown Firecrawl peut être vide** → vérifier `data.data.markdown` pas juste `data.data`
6. **Cache MD5 collision impossible** mais vérifier pas de path traversal
7. **Audit log peut grossir** → rotation à prévoir si >10MB (pas urgent)

---

## 📊 MÉTRIQUES SUCCÈS

Après 1 semaine d'usage:
- Cache hit rate > 60% (économie quota)
- Zéro erreur 500 Firecrawl
- Temps réponse moyen < 3s (cache) / < 8s (fresh)
- Quota utilisé < 150/500 (marge confortable)

---

## 🎯 PROMPT POUR CLAUDE CODE

Copier-coller ceci dans Claude Code:

> Lis `FIRECRAWL_PROMPT_CLAUDE_CODE.md` dans le repo kira-bot.
>
> Exécute l'intégration COMPLÈTE en suivant chaque étape:
> 1. Crée `firecrawl_scraper.js` avec le code exact fourni
> 2. Modifie `bot.js` pour ajouter les 2 tools + require + commande `/firecrawl`
> 3. Crée `test_firecrawl.js` et lance les tests (demande à Shawn la clé API si besoin)
> 4. Lance `node validate.js`
> 5. Commit avec message `[FEAT] Intégration Firecrawl - scraping municipal bulletproof`
> 6. Push vers main
> 7. Attends 90s, vérifie `/health` Render
> 8. Rapport final à Shawn dans SESSION_LIVE.md avec: status, tools count, cache state
>
> Ne prends AUCUN raccourci. Respecte 100% du code fourni. Tous les tests doivent passer avant commit.

---

**Fin du document. Intégration prévue: 45-60 minutes.**
