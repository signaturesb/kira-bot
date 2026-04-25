// firecrawl_scraper.js — Scraping sites municipaux + URLs arbitraires
// Version: 3.0 — fetch natif Node 18+ (pas de dépendance node-fetch)
// Clé: fc-52e378f6759746e4807406ddc3517d07 (via FIRECRAWL_API_KEY env var)
// Cache MD5 30 jours persistant dans /data/firecrawl_cache/
// 2026-04-25 — Production ready

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const DATA_DIR    = fs.existsSync('/data') ? '/data' : '/tmp';
const CACHE_DIR   = path.join(DATA_DIR, 'firecrawl_cache');
const QUOTA_FILE  = path.join(DATA_DIR, 'firecrawl_quota.json');
const AUDIT_FILE  = path.join(DATA_DIR, 'firecrawl_audit.jsonl');
const CACHE_TTL   = 30 * 24 * 60 * 60 * 1000; // 30 jours
const API_BASE    = 'https://api.firecrawl.dev/v1';
const TIMEOUT_MS  = 45000;
const MAX_RETRIES = 2;
const QUOTA_LIMIT = parseInt(process.env.FIRECRAWL_QUOTA_MONTHLY || '500');

// Initialiser répertoire cache
try {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch (e) { /* ignore */ }

// ═══════════════════════════════════════════════════════════════════════════
// VILLES MUNICIPALES PRÉ-CONFIGURÉES
// ═══════════════════════════════════════════════════════════════════════════

const MUNICIPALITES = {
  'sainte-julienne': {
    nom: 'Sainte-Julienne',
    pages: {
      zonage:    'https://sainte-julienne.com/services-aux-citoyens/urbanisme/reglement-de-zonage/',
      urbanisme: 'https://sainte-julienne.com/services-aux-citoyens/urbanisme/',
      permis:    'https://sainte-julienne.com/services-aux-citoyens/urbanisme/permis-et-certificats/',
      taxes:     'https://sainte-julienne.com/services-aux-citoyens/taxation/',
      riveraine: 'https://sainte-julienne.com/services-aux-citoyens/urbanisme/reglement-de-zonage/',
    },
    telephone: '450-831-2929',
    note: 'Poste 7235 pour urbanisme'
  },
  'rawdon': {
    nom: 'Rawdon',
    pages: {
      zonage:    'https://rawdon.ca/services-aux-citoyens/urbanisme/',
      urbanisme: 'https://rawdon.ca/services-aux-citoyens/urbanisme/',
      permis:    'https://rawdon.ca/services-aux-citoyens/urbanisme/permis/',
      taxes:     'https://rawdon.ca/services-aux-citoyens/taxes/',
      riveraine: 'https://rawdon.ca/services-aux-citoyens/urbanisme/',
    },
    telephone: '450-834-2596'
  },
  'chertsey': {
    nom: 'Chertsey',
    pages: {
      zonage:    'https://chertsey.ca/services-aux-citoyens/urbanisme-et-permis/',
      urbanisme: 'https://chertsey.ca/services-aux-citoyens/urbanisme-et-permis/',
      permis:    'https://chertsey.ca/services-aux-citoyens/urbanisme-et-permis/',
      taxes:     'https://chertsey.ca/services-aux-citoyens/taxes/',
      riveraine: 'https://chertsey.ca/services-aux-citoyens/urbanisme-et-permis/',
    },
    telephone: '450-882-2920'
  },
  'saint-calixte': {
    nom: 'Saint-Calixte',
    pages: {
      zonage:    'https://saint-calixte.ca/services-municipaux/urbanisme/',
      urbanisme: 'https://saint-calixte.ca/services-municipaux/urbanisme/',
      permis:    'https://saint-calixte.ca/services-municipaux/urbanisme/permis/',
      taxes:     'https://saint-calixte.ca/services-municipaux/taxes/',
      riveraine: 'https://saint-calixte.ca/services-municipaux/urbanisme/',
    },
    telephone: '450-839-2002'
  },
  'saint-jean-de-matha': {
    nom: 'Saint-Jean-de-Matha',
    pages: {
      zonage:    'https://saint-jean-de-matha.ca/urbanisme/',
      urbanisme: 'https://saint-jean-de-matha.ca/urbanisme/',
      permis:    'https://saint-jean-de-matha.ca/urbanisme/permis/',
      taxes:     'https://saint-jean-de-matha.ca/taxes/',
      riveraine: 'https://saint-jean-de-matha.ca/urbanisme/',
    },
    telephone: '450-886-3778'
  },
  'saint-didace': {
    nom: 'Saint-Didace',
    pages: {
      zonage:    'https://saint-didace.com/urbanisme/',
      urbanisme: 'https://saint-didace.com/urbanisme/',
      permis:    'https://saint-didace.com/urbanisme/',
      taxes:     'https://saint-didace.com/taxes/',
      riveraine: 'https://saint-didace.com/urbanisme/',
    },
    telephone: '450-835-9340'
  },
  'matawinie': {
    nom: 'MRC Matawinie',
    pages: {
      zonage:    'https://matawinie.org/amenagement-du-territoire/',
      urbanisme: 'https://matawinie.org/amenagement-du-territoire/',
      permis:    'https://matawinie.org/amenagement-du-territoire/',
      taxes:     'https://matawinie.org/services/',
      riveraine: 'https://matawinie.org/amenagement-du-territoire/protection-rives-littoral/',
    },
    telephone: '450-834-5441'
  },
  'd-autray': {
    nom: "MRC D'Autray",
    pages: {
      zonage:    'https://mrcautray.qc.ca/amenagement/',
      urbanisme: 'https://mrcautray.qc.ca/amenagement/',
      permis:    'https://mrcautray.qc.ca/amenagement/',
      taxes:     'https://mrcautray.qc.ca/services/',
      riveraine: 'https://mrcautray.qc.ca/amenagement/',
    },
    telephone: '450-836-7007'
  }
};

// Mots-clés par sujet pour extraire la bonne section
const SUJETS_MOTS_CLES = {
  zonage:    ['marge', 'latérale', 'arrière', 'avant', 'recul', 'hauteur', 'implantation', 'zone', 'grille', 'spécification'],
  urbanisme: ['règlement', 'zonage', 'subdivision', 'usage', 'lotissement', 'construction'],
  permis:    ['permis', 'certificat', 'autorisation', 'construction', 'délai', 'frais', 'formulaire'],
  taxes:     ['taux', 'taxe', 'évaluation', 'foncière', 'cotisation', 'millième'],
  riveraine: ['riveraine', 'littoral', 'bande', 'cours d\'eau', '30 mètre', '15 mètre', 'rive', 'lac'],
};

// ═══════════════════════════════════════════════════════════════════════════
// CACHE MD5 PERSISTANT
// ═══════════════════════════════════════════════════════════════════════════

function cacheKey(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

function getCached(url) {
  try {
    const file = path.join(CACHE_DIR, `${cacheKey(url)}.json`);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - data.ts > CACHE_TTL) { try { fs.unlinkSync(file); } catch {} return null; }
    return data;
  } catch { return null; }
}

function setCached(url, markdown, metadata = {}) {
  try {
    const file = path.join(CACHE_DIR, `${cacheKey(url)}.json`);
    fs.writeFileSync(file, JSON.stringify({ url, ts: Date.now(), markdown, metadata }));
  } catch (e) { console.warn('[firecrawl] cache write error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUOTA TRACKER
// ═══════════════════════════════════════════════════════════════════════════

function getQuota() {
  try {
    if (!fs.existsSync(QUOTA_FILE)) return { month: currentMonth(), count: 0 };
    const q = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8'));
    if (q.month !== currentMonth()) return { month: currentMonth(), count: 0 };
    return q;
  } catch { return { month: currentMonth(), count: 0 }; }
}

function incQuota() {
  const q = getQuota();
  q.count++;
  try { fs.writeFileSync(QUOTA_FILE, JSON.stringify(q)); } catch {}
  return q.count;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

function auditLog(url, status, fromCache, chars) {
  try {
    const entry = JSON.stringify({ ts: Date.now(), url, status, fromCache, chars }) + '\n';
    fs.appendFileSync(AUDIT_FILE, entry);
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
// APPEL API FIRECRAWL (avec retry + backoff)
// ═══════════════════════════════════════════════════════════════════════════

async function firecrawlScrape(url) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY manquant dans env vars Render');

  const payload = {
    url,
    formats: ['markdown'],
    onlyMainContent: true,
    waitFor: 2000,
    timeout: TIMEOUT_MS,
  };

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 1000; // 1s, 2s
      await new Promise(r => setTimeout(r, delay));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS + 5000);

    try {
      const res = await fetch(`${API_BASE}/scrape`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Firecrawl HTTP ${res.status}: ${txt.slice(0, 150)}`);
      }

      const data = await res.json();
      if (!data.success) throw new Error(`Firecrawl: ${data.error || 'échec inconnu'}`);

      // Compter quota (seulement sur succès)
      const count = incQuota();
      if (count >= QUOTA_LIMIT * 0.8) {
        console.warn(`[firecrawl] ⚠️ Quota: ${count}/${QUOTA_LIMIT} (${Math.round(count/QUOTA_LIMIT*100)}%)`);
      }

      return {
        markdown: data.data?.markdown || '',
        metadata: data.data?.metadata || {},
      };

    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err.name === 'AbortError') lastErr = new Error(`Firecrawl timeout (${TIMEOUT_MS/1000}s)`);
      console.warn(`[firecrawl] tentative ${attempt + 1}/${MAX_RETRIES + 1} échouée: ${lastErr.message}`);
    }
  }

  throw lastErr;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTION DE SECTION PERTINENTE
// ═══════════════════════════════════════════════════════════════════════════

function extractSection(markdown, motsCles) {
  if (!markdown || !motsCles?.length) return markdown?.slice(0, 3000) || '';

  const lignes = markdown.split('\n');
  const sections = [];
  const mots = motsCles.map(m => m.toLowerCase());

  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i].toLowerCase();
    if (mots.some(m => l.includes(m))) {
      const start = Math.max(0, i - 2);
      const end   = Math.min(lignes.length, i + 8);
      sections.push(lignes.slice(start, end).join('\n'));
      i = end - 1; // skip les lignes déjà capturées
    }
  }

  if (sections.length === 0) {
    // Fallback: premiers 2000 chars
    return markdown.slice(0, 2000);
  }

  return sections.join('\n\n---\n\n').slice(0, 4000);
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER URL ARBITRAIRE (avec cache)
// ═══════════════════════════════════════════════════════════════════════════

async function scrapUrl(url, motsCles = []) {
  const cached = getCached(url);
  if (cached) {
    auditLog(url, 'cache_hit', true, cached.markdown?.length || 0);
    return {
      markdown: extractSection(cached.markdown, motsCles),
      fromCache: true,
      cacheAgeDays: Math.floor((Date.now() - cached.ts) / 86400000),
      url,
    };
  }

  const result = await firecrawlScrape(url);
  setCached(url, result.markdown, result.metadata);
  auditLog(url, 'scraped', false, result.markdown?.length || 0);

  return {
    markdown: extractSection(result.markdown, motsCles),
    fromCache: false,
    url,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCRAPER SITE MUNICIPAL (avec fallback téléphone)
// ═══════════════════════════════════════════════════════════════════════════

async function scrapMunicipalite(villeSlug, sujet = 'zonage') {
  const mun = MUNICIPALITES[villeSlug];
  if (!mun) {
    const dispo = Object.keys(MUNICIPALITES).join(', ');
    throw new Error(`Ville inconnue: "${villeSlug}". Disponibles: ${dispo}`);
  }

  const url = mun.pages[sujet] || mun.pages['urbanisme'];
  if (!url) throw new Error(`Sujet "${sujet}" non configuré pour ${mun.nom}`);

  const motsCles = SUJETS_MOTS_CLES[sujet] || [];

  try {
    const result = await scrapUrl(url, motsCles);
    return {
      ville: mun.nom,
      sujet,
      url,
      contenu: result.markdown,
      fromCache: result.fromCache,
      cacheAgeDays: result.cacheAgeDays || 0,
      telephone: mun.telephone,
      note: mun.note || null,
    };
  } catch (err) {
    // Fallback téléphone si scraping échoue
    auditLog(url, `error: ${err.message}`, false, 0);
    return {
      ville: mun.nom,
      sujet,
      url,
      contenu: null,
      error: err.message,
      fallback: `Appeler directement: ${mun.telephone}${mun.note ? ` (${mun.note})` : ''}`,
      telephone: mun.telephone,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRAIRE LIENS PDF D'UNE PAGE
// ═══════════════════════════════════════════════════════════════════════════

async function extraireLiensPDF(url) {
  const result = await scrapUrl(url, ['pdf', '.pdf', 'règlement', 'zonage', 'plan']);
  const markdown = result.markdown || '';

  // Extraire les liens du markdown
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+\.pdf[^)]*)\)/gi;
  const urlRe  = /https?:\/\/[^\s)">]+\.pdf[^\s)">]*/gi;

  const pdfs = [];
  let m;

  while ((m = linkRe.exec(markdown)) !== null) {
    pdfs.push({ titre: m[1], url: m[2] });
  }

  // URLs brutes sans titre
  while ((m = urlRe.exec(markdown)) !== null) {
    if (!pdfs.some(p => p.url === m[0])) {
      pdfs.push({ titre: path.basename(m[0], '.pdf'), url: m[0] });
    }
  }

  return { url, pdfs, contenu: result.markdown };
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOLVER VILLE (aliases et variations)
// ═══════════════════════════════════════════════════════════════════════════

function resoudreVille(input) {
  if (!input) return null;
  const norm = input.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['\s]+/g, '-')
    .replace(/^(mrc-)?/, '');

  // Match direct
  if (MUNICIPALITES[norm]) return norm;

  // Aliases
  const aliases = {
    'ste-julienne': 'sainte-julienne',
    'st-julienne':  'sainte-julienne',
    'julienne':     'sainte-julienne',
    'st-calixte':   'saint-calixte',
    'calixte':      'saint-calixte',
    'st-jean':      'saint-jean-de-matha',
    'matha':        'saint-jean-de-matha',
    'jean-de-matha':'saint-jean-de-matha',
    'didace':       'saint-didace',
    'st-didace':    'saint-didace',
    'autray':       'd-autray',
    "d'autray":     'd-autray',
  };
  if (aliases[norm]) return aliases[norm];

  // Partial match
  for (const key of Object.keys(MUNICIPALITES)) {
    if (key.includes(norm) || norm.includes(key)) return key;
  }

  return null;
}

module.exports = {
  scrapMunicipalite,
  scrapUrl,
  extraireLiensPDF,
  resoudreVille,
  MUNICIPALITES,
  SUJETS_MOTS_CLES,
  getCached,
  getQuota,
};
