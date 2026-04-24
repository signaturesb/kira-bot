# 🔥 INTÉGRATION FIRECRAWL — Scraping Sites Municipaux

> **Objectif:** Permettre au bot de scraper en temps réel les sites municipaux (Sainte-Julienne, Rawdon, Chertsey, St-Calixte, MRC Matawinie, D'Autray) pour extraire grilles de zonage, règlements, marges latérales, permis, taxes — sans appels téléphoniques manuels.
>
> **Outil choisi:** Firecrawl (firecrawl.dev) — API simple, markdown propre, gère JavaScript, plan gratuit 500 pages/mois.
>
> **Effort:** ~45 min d'intégration + tests.

---

## 🎯 CE QUE ÇA DÉBLOQUE

- Grilles de zonage en temps réel (marges latérales, reculs, hauteurs max)
- Règlements municipaux complets
- Taxes foncières, permis de construction
- Bandes riveraines, zones inondables
- Cache 30 jours → zero re-scrape inutile
- **Zero appel téléphonique pour info publique**

---

## ⚙️ ÉTAPES D'INTÉGRATION

### ÉTAPE 1 — Obtenir la clé API Firecrawl (2 min)

1. Aller sur https://firecrawl.dev
2. Créer compte avec shawn@signaturesb.com
3. Dashboard → API Keys → copier la clé (format: `fc-xxxxxxxxxxxx`)
4. Plan gratuit suffit au début (500 pages/mois)

### ÉTAPE 2 — Ajouter env var Render

```bash
# Dans Render Dashboard → signaturesb-bot → Environment
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxx
```

⚠️ **RÈGLE RENDER:** `PUT /services/{id}/env-vars` remplace TOUTES les env vars.
Utiliser `scripts/sync-env-render.js` ou ajouter manuellement via Dashboard.

### ÉTAPE 3 — Créer `firecrawl_scraper.js`

Créer le fichier à la racine du repo `kira-bot`:

```javascript
// firecrawl_scraper.js — Scraping sites municipaux via Firecrawl
// Cache 30 jours persistant dans /data/municipal_cache.json

const fs = require('fs');
const path = require('path');

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1/scrape';
const CACHE_PATH = '/data/municipal_cache.json';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

// ═══════════════════════════════════════════════════════════
// CACHE PERSISTANT
// ═══════════════════════════════════════════════════════════

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('[firecrawl] cache load error:', e.message);
  }
  return {};
}

function saveCache(cache) {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('[firecrawl] cache save error:', e.message);
  }
}

function getCacheKey(url) {
  return url.toLowerCase().trim();
}

function isCacheValid(entry) {
  return entry && entry.timestamp && (Date.now() - entry.timestamp) < CACHE_TTL_MS;
}

// ═══════════════════════════════════════════════════════════
// API CALL FIRECRAWL
// ═══════════════════════════════════════════════════════════

async function scrapeWithFirecrawl(url, options = {}) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY manquant dans env vars Render');
  }

  const payload = {
    url,
    formats: options.formats || ['markdown'],
    onlyMainContent: options.onlyMainContent !== false,
    waitFor: options.waitFor || 2000, // attend JS si besoin
    timeout: options.timeout || 30000
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(FIRECRAWL_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Firecrawl ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(`Firecrawl échec: ${data.error || 'inconnu'}`);
    }

    return {
      markdown: data.data?.markdown || '',
      html: data.data?.html || '',
      metadata: data.data?.metadata || {},
      url
    };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error('Firecrawl timeout (45s)');
    }
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════
// SCRAPE AVEC CACHE
// ═══════════════════════════════════════════════════════════

async function scrapeUrl(url, options = {}) {
  const cache = loadCache();
  const key = getCacheKey(url);

  // Skip cache si forceRefresh
  if (!options.forceRefresh && isCacheValid(cache[key])) {
    console.log(`[firecrawl] cache hit: ${url}`);
    return { ...cache[key].data, _cached: true, _age_days: Math.floor((Date.now() - cache[key].timestamp) / 86400000) };
  }

  console.log(`[firecrawl] scraping live: ${url}`);
  const result = await scrapeWithFirecrawl(url, options);

  // Sauvegarde cache
  cache[key] = {
    timestamp: Date.now(),
    data: result
  };
  saveCache(cache);

  return { ...result, _cached: false };
}

// ═══════════════════════════════════════════════════════════
// RECHERCHE INTELLIGENTE DANS LE MARKDOWN
// ═══════════════════════════════════════════════════════════

function rechercherDansMarkdown(markdown, mots_cles) {
  if (!markdown) return [];
  const lignes = markdown.split('\n');
  const resultats = [];
  const mots = Array.isArray(mots_cles) ? mots_cles : [mots_cles];

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    const ligneLower = ligne.toLowerCase();
    const match = mots.some(mot => ligneLower.includes(mot.toLowerCase()));
    if (match) {
      // Capturer contexte: 2 lignes avant + ligne + 5 lignes après
      const start = Math.max(0, i - 2);
      const end = Math.min(lignes.length, i + 6);
      const contexte = lignes.slice(start, end).join('\n');
      resultats.push({ ligne_num: i, contexte });
    }
  }

  return resultats;
}

// ═══════════════════════════════════════════════════════════
// SITES MUNICIPAUX CONNUS (raccourcis)
// ═══════════════════════════════════════════════════════════

const SITES_MUNICIPAUX = {
  'sainte-julienne': {
    nom: 'Sainte-Julienne',
    base: 'https://sainte-julienne.com',
    urbanisme: 'https://sainte-julienne.com/services-aux-citoyens/urbanisme/',
    zonage: 'https://sainte-julienne.com/services-aux-citoyens/urbanisme/reglementation/',
    tel: '(450) 831-2929'
  },
  'rawdon': {
    nom: 'Rawdon',
    base: 'https://rawdon.ca',
    urbanisme: 'https://rawdon.ca/services-aux-citoyens/urbanisme/',
    tel: '(450) 834-2596'
  },
  'chertsey': {
    nom: 'Chertsey',
    base: 'https://chertsey.ca',
    urbanisme: 'https://chertsey.ca/services-aux-citoyens/urbanisme-et-permis/',
    tel: '(450) 882-2920'
  },
  'saint-calixte': {
    nom: 'Saint-Calixte',
    base: 'https://saint-calixte.ca',
    urbanisme: 'https://saint-calixte.ca/services-municipaux/urbanisme/',
    tel: '(450) 839-2002'
  },
  'matawinie': {
    nom: 'MRC Matawinie',
    base: 'https://mrcmatawinie.org',
    tel: '(450) 834-5441'
  },
  'autray': {
    nom: 'MRC D\'Autray',
    base: 'https://mrcautray.qc.ca',
    tel: '(450) 836-7007'
  }
};

function resoudreVille(ville) {
  if (!ville) return null;
  const v = ville.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, info] of Object.entries(SITES_MUNICIPAUX)) {
    if (key.includes(v) || v.includes(key) || info.nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(v)) {
      return { key, ...info };
    }
  }
  return null;
}

module.exports = {
  scrapeUrl,
  scrapeWithFirecrawl,
  rechercherDansMarkdown,
  SITES_MUNICIPAUX,
  resoudreVille,
  loadCache,
  saveCache
};
```

### ÉTAPE 4 — Ajouter 2 nouveaux outils dans `bot.js`

**4A — Ajouter l'import en haut de bot.js (avec les autres requires):**

```javascript
const firecrawl = require('./firecrawl_scraper');
```

**4B — Ajouter les 2 outils dans la définition `tools` (là où sont déclarés les 40 autres outils):**

```javascript
{
  name: 'scraper_site_municipal',
  description: 'Scrape un site municipal (ville ou MRC) pour extraire règlements, grilles de zonage, marges latérales, taxes. Cache 30j automatique. Utiliser pour "grille de zonage Sainte-Julienne", "marges latérales Rawdon", "bande riveraine St-Calixte". Retourne le markdown complet + recherche par mots-clés.',
  input_schema: {
    type: 'object',
    properties: {
      ville: {
        type: 'string',
        description: 'Nom de la ville: Sainte-Julienne, Rawdon, Chertsey, Saint-Calixte, Matawinie, Autray'
      },
      mots_cles: {
        type: 'string',
        description: 'Mots-clés à chercher dans le contenu (ex: "marge latérale", "bande riveraine", "hauteur maximale"). Optionnel.'
      },
      url_specifique: {
        type: 'string',
        description: 'URL précise si déjà connue (override la ville). Optionnel.'
      },
      forceRefresh: {
        type: 'boolean',
        description: 'Ignorer cache et re-scraper. Défaut: false.'
      }
    },
    required: ['ville']
  }
},
{
  name: 'scraper_url',
  description: 'Scrape N\'IMPORTE QUELLE URL et retourne le contenu en markdown propre. Pour règlements PDF, grilles zonage, documents gouvernementaux. Cache 30j.',
  input_schema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL complète à scraper (https://...)'
      },
      mots_cles: {
        type: 'string',
        description: 'Mots-clés à chercher dans le contenu. Optionnel.'
      },
      forceRefresh: {
        type: 'boolean',
        description: 'Ignorer cache et re-scraper. Défaut: false.'
      }
    },
    required: ['url']
  }
}
```

**4C — Ajouter les handlers dans `executeToolSafe()` (ou équivalent `switch` / `if`):**

```javascript
if (toolName === 'scraper_site_municipal') {
  const { ville, mots_cles, url_specifique, forceRefresh } = toolInput;
  
  try {
    let url = url_specifique;
    let info = null;
    
    if (!url) {
      info = firecrawl.resoudreVille(ville);
      if (!info) {
        return `❌ Ville inconnue: "${ville}"\n\nVilles supportées: ${Object.values(firecrawl.SITES_MUNICIPAUX).map(s => s.nom).join(', ')}\n\nUtilise scraper_url avec l'URL précise si tu veux scraper autre chose.`;
      }
      url = info.urbanisme || info.base;
    }
    
    const result = await firecrawl.scrapeUrl(url, { forceRefresh });
    const statusCache = result._cached ? `📦 Cache (${result._age_days}j)` : '🔥 Live';
    
    let output = `${statusCache} · ${info?.nom || url}\n`;
    output += `📍 ${url}\n`;
    if (info?.tel) output += `📞 ${info.tel}\n`;
    output += `\n═══════════════════════════════════\n`;
    
    if (mots_cles) {
      const matches = firecrawl.rechercherDansMarkdown(result.markdown, mots_cles.split(','));
      if (matches.length === 0) {
        output += `\n⚠️ Aucun résultat pour "${mots_cles}" dans cette page.\n\nVoici les 2000 premiers caractères:\n\n${result.markdown.slice(0, 2000)}`;
      } else {
        output += `\n🎯 ${matches.length} résultat(s) pour "${mots_cles}":\n\n`;
        matches.slice(0, 5).forEach((m, i) => {
          output += `── Match ${i + 1} ──\n${m.contexte}\n\n`;
        });
      }
    } else {
      output += `\n${result.markdown.slice(0, 4000)}`;
      if (result.markdown.length > 4000) output += `\n\n... [${result.markdown.length - 4000} caractères de plus — utilise mots_cles pour cibler]`;
    }
    
    return output;
  } catch (e) {
    return `❌ Scraping échoué: ${e.message}\n\nFallback:\n${info?.tel ? `📞 Appeler directement: ${info.tel}` : '📞 Appeler la municipalité'}`;
  }
}

if (toolName === 'scraper_url') {
  const { url, mots_cles, forceRefresh } = toolInput;
  
  try {
    const result = await firecrawl.scrapeUrl(url, { forceRefresh });
    const statusCache = result._cached ? `📦 Cache (${result._age_days}j)` : '🔥 Live';
    
    let output = `${statusCache}\n📍 ${url}\n`;
    if (result.metadata?.title) output += `📄 ${result.metadata.title}\n`;
    output += `\n═══════════════════════════════════\n`;
    
    if (mots_cles) {
      const matches = firecrawl.rechercherDansMarkdown(result.markdown, mots_cles.split(','));
      if (matches.length === 0) {
        output += `\n⚠️ Aucun résultat pour "${mots_cles}".\n\nDébut du contenu:\n\n${result.markdown.slice(0, 2000)}`;
      } else {
        output += `\n🎯 ${matches.length} résultat(s):\n\n`;
        matches.slice(0, 5).forEach((m, i) => {
          output += `── Match ${i + 1} ──\n${m.contexte}\n\n`;
        });
      }
    } else {
      output += `\n${result.markdown.slice(0, 4000)}`;
      if (result.markdown.length > 4000) output += `\n\n... [${result.markdown.length - 4000} caractères de plus]`;
    }
    
    return output;
  } catch (e) {
    return `❌ Scraping échoué: ${e.message}`;
  }
}
```

### ÉTAPE 5 — Mettre à jour `CLAUDE.md`

Dans la section "40 Outils", changer à **42 outils** et ajouter:

```markdown
### Scraping Web (2) — NOUVEAU
`scraper_site_municipal` `scraper_url` — Firecrawl API, cache 30j /data/municipal_cache.json
```

### ÉTAPE 6 — Tests de validation

```bash
# 1. Syntaxe OK
node --check bot.js
node --check firecrawl_scraper.js

# 2. Validate
node validate.js

# 3. Test isolé du scraper (créer test_firecrawl.js temporaire):
node -e "
require('dotenv').config();
const fc = require('./firecrawl_scraper');
fc.scrapeUrl('https://sainte-julienne.com/services-aux-citoyens/urbanisme/').then(r => {
  console.log('✅ Markdown length:', r.markdown.length);
  console.log('Title:', r.metadata.title);
  console.log('Preview:', r.markdown.slice(0, 500));
}).catch(e => console.error('❌', e.message));
"

# 4. Commit + push
git add -A
git commit -m "[FEATURE] Firecrawl scraping sites municipaux + cache 30j"
git push origin main

# 5. Attendre Render (90s) puis vérifier
curl https://signaturesb-bot-s272.onrender.com/health

# 6. Test via Telegram:
# "Scrape le site de Sainte-Julienne et trouve-moi les marges latérales"
```

---

## 🛡️ SÉCURITÉ & ROBUSTESSE

✅ Timeout 45s sur chaque appel Firecrawl
✅ AbortController pour éviter crashes
✅ Cache persistant /data/ (survit aux redémarrages Render)
✅ Fallback téléphone si scraping échoue
✅ `onlyMainContent: true` = pas de menu/footer inutile
✅ `waitFor: 2000ms` = gère sites avec JS dynamique
✅ Cache 30j = protège du rate limit gratuit (500 pages/mois)
✅ Aucune clé hardcodée (tout en env vars)

---

## 💰 COÛTS

| Plan | Prix | Pages/mois | Suffisant? |
|------|------|------------|------------|
| **Free** | 0$ | 500 | ✅ Oui (avec cache 30j) |
| Hobby | 16$ USD | 3 000 | Si volume augmente |
| Standard | 83$ USD | 100 000 | Overkill |

Avec cache 30j, 500 pages/mois = **~16 nouvelles pages/jour** = largement suffisant pour 6 municipalités + rares documents additionnels.

---

## 🎯 EXEMPLES D'USAGE (après intégration)

**Shawn sur Telegram:**
- "Grille zonage Sainte-Julienne zone H-12"
- "Marges latérales Rawdon résidentiel"
- "Bande riveraine St-Calixte"
- "Permis construction Chertsey"
- "Scrape cette URL: https://..."

**Le bot:**
1. Appelle `scraper_site_municipal(ville, mots_cles)`
2. Retourne markdown filtré + numéro téléphone fallback
3. Cache 30j → prochaine requête = instantanée

---

## ✅ CHECKLIST FINALE

- [ ] Compte Firecrawl créé + clé obtenue
- [ ] `FIRECRAWL_API_KEY` ajouté dans Render env vars
- [ ] `firecrawl_scraper.js` créé à la racine
- [ ] 2 outils ajoutés dans `tools` de `bot.js`
- [ ] 2 handlers ajoutés dans `executeToolSafe()`
- [ ] Import `const firecrawl = require('./firecrawl_scraper')` ajouté
- [ ] `CLAUDE.md` mis à jour (40 → 42 outils)
- [ ] `node --check bot.js` passe
- [ ] `node validate.js` passe
- [ ] Test isolé du scraper fonctionne
- [ ] Commit + push
- [ ] `/health` Render OK après déploiement
- [ ] Test réel via Telegram sur sainte-julienne.com

---

**Prêt pour exécution dans Claude Code.** Temps estimé: 45 minutes.
