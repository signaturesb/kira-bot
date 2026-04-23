// lead_parser.js — Parser de leads email, extrait de bot.js pour testabilité
// Utilisé par bot.js (production) + test_parser.js (suite de tests)
// ─── PATCH 2026-04-24 ───────────────────────────────────────────────────────
// • Validation anti-faux-positifs (nom du courtier, mots génériques)
// • parseLeadEmailWithAI merge amélioré (AI comble regex, jamais l'inverse)
// • Exports centralisés pour bot.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const LEAD_EMAIL_PATTERNS = [
  { re: /centris/i,               source: 'centris',   label: 'Centris.ca' },
  { re: /remax/i,                 source: 'remax',     label: 'RE/MAX Québec' },
  { re: /realtor|crea\.ca/i,      source: 'realtor',   label: 'Realtor.ca' },
  { re: /duproprio/i,             source: 'duproprio', label: 'DuProprio' },
  { re: /kijiji|facebook/i,       source: 'social',    label: 'Réseau social' },
];

const LEAD_SUBJECT_RE = /demande|lead|prospect|contact|information|intéress|inquiry|visite|acheteur|request/i;

// ─── Noms à rejeter absolument comme prospect ────────────────────────────────
// Toute extraction qui retourne un de ces noms = parsing raté = fallback AI
const AGENT_NAMES = [
  'shawn barrette', 'shawn', 'barrette',
  'julie', 'julie signaturesb',
  're/max', 'remax', 'prestige',
  'centris', 'courtier', 'agent',
];

// ─── Mots génériques qui ne sont jamais des noms de prospect ────────────────
const GENERIC_WORDS = [
  'bonjour', 'merci', 'bonsoir', 'salut', 'hello',
  'je', 'vous', 'nous', 'ils', 'elles',
  'monsieur', 'madame', 'mme', 'm.',
  'prospect', 'client', 'acheteur', 'vendeur',
  'information', 'demande', 'visite', 'terrain',
  'maison', 'propriété', 'immeuble', 'plex',
];

function isValidProspectName(nom) {
  if (!nom || nom.length < 3) return false;
  const lower = nom.toLowerCase().trim();
  // Rejeter noms d'agent
  if (AGENT_NAMES.some(a => lower === a || lower.includes(a))) return false;
  // Rejeter mots génériques
  if (GENERIC_WORDS.some(w => lower === w)) return false;
  // Doit avoir au moins 2 mots (prénom + nom)
  const words = nom.trim().split(/\s+/);
  if (words.length < 2) return false;
  // Chaque mot doit commencer par majuscule
  const allCap = words.every(w => /^[A-ZÀ-Ü]/.test(w));
  if (!allCap) return false;
  // Longueur raisonnable
  if (nom.length > 60) return false;
  return true;
}

function isValidEmail(email) {
  if (!email) return false;
  // Exclure emails internes/système
  const lower = email.toLowerCase();
  const blocked = [
    'signaturesb', 'remax', 'centris', 'noreply', 'no-reply',
    'nepasrepondre', 'donotreply', 'info@', 'admin@', 'support@',
    'notification', 'brevo', 'brevosend', 'mailchimp',
  ];
  if (blocked.some(b => lower.includes(b))) return false;
  // Format valide
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
}

function isValidPhone(tel) {
  if (!tel) return false;
  const digits = tel.replace(/\D/g, '');
  // 10 chiffres North America (ou 11 avec +1)
  return digits.length === 10 || (digits.length === 11 && digits[0] === '1');
}

function detectLeadSource(from, subject) {
  const txt = `${from} ${subject}`.toLowerCase();
  for (const s of LEAD_EMAIL_PATTERNS) {
    if (s.re.test(txt)) return s;
  }
  if (LEAD_SUBJECT_RE.test(subject)) return { source: 'direct', label: 'Demande directe' };
  return null;
}

function isJunkLeadEmail(subject, from, body) {
  const s = (subject || '').toLowerCase();
  const f = (from || '').toLowerCase();
  const b = (body || '').toLowerCase();
  const sb = s + ' ' + b;

  // Notifications Centris auto (tous les domaines Centris)
  const isCentrisAuto = f.includes('no-reply@centris') || f.includes('noreply@centris')
    || f.includes('notifications@centris') || f.includes('@mlsmatrix') || f.includes('centris@');
  if (isCentrisAuto) {
    if (/notification|r[eé]pondent\s+à\s+vos\s+crit[eè]res|d[eé]couvrez-les|inscriptions?\s+(correspondantes|matching|nouvelles)|une\s+ou\s+plusieurs\s+nouvelles\s+propri[eé]t[eé]s|voir\s+les\s+inscriptions/i.test(sb)) return true;
  }
  // Pattern sujet saved-search typique
  if (/^\[[^\]]+\]\s+(maison|terrain|plex|condo|chalet)\b/i.test(s)) return true;
  // Newsletters / promotions
  if (/(newsletter|infolettre|promotion|offre\s+sp[eé]ciale|super\s+promo|last\s+call|ending\s+soon|spring\s+sale|votre\s+campagne)/i.test(s)) return true;
  // Brevo / marketing tool notifications
  if (f.includes('brevo') || f.includes('brevosend')) return true;
  // Confirmations/annulations de visite entre courtiers
  if (/(confirmation|annulation|modification)\s+de\s+visite\s+-/i.test(s)) return true;
  if (/demande\s+de\s+visite\s+-/i.test(s) && f.includes('remax')) return true;
  // Alertes système internes
  if (/watchdog|system\s+alert|hmac/i.test(s)) return true;
  return false;
}

function parseLeadEmail(body, subject, from) {
  let clean = (body || '')
    .replace(/\r/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ');

  // NOTE: on N'inclut PAS le champ `from` dans full pour le nom — risque de capturer
  // le nom du courtier si l'email vient de "Shawn Barrette via Centris"
  const full = `${subject || ''} ${clean}`;
  const fullWithFrom = `${full} ${from || ''}`;

  const extract = (...patterns) => {
    for (const p of patterns) {
      const m = full.match(p);
      if (m?.[1]?.trim()) return m[1].trim().substring(0, 100);
    }
    return '';
  };

  // Nom — patterns stricts, première lettre majuscule obligatoire
  const STOP = '(?=\\s+(?:T[eé]l[eé]phone|t[eé]l[eé]phone|Tel|tel|Phone|phone|Courriel|courriel|Email|email|E-mail|e-mail|Adresse|adresse|Message|message|Type|type|Vous|vous|MLS|mls|Centris|centris)\\b|\\s*[:;|<>\\n\\r]|\\s*$)';
  const UC = '[A-ZÀ-Ü][A-Za-zÀ-Üà-ü\\-\']+';
  let nom = extract(
    new RegExp(`\\b(?:Nom(?:\\s+(?:complet|du\\s+contact|et\\s+pr[eé]nom))?|Name|Client|Acheteur|Vendeur|Pr[eé]nom\\s+et\\s+nom|Contact)\\s*:?\\s+(${UC}(?:\\s+${UC}){1,3}?)${STOP}`),
    new RegExp(`\\bNom\\s+(${UC}(?:\\s+${UC}){1,3}?)${STOP}`),
    new RegExp(`\\b(?:Mon\\s+nom\\s+est|mon\\s+nom\\s+est|Je\\s+m'appelle|je\\s+m'appelle)\\s+(${UC}(?:\\s+${UC}){1,2}?)(?=\\b)`),
    new RegExp(`\\b[Mm]y\\s+[Nn]ame\\s+[Ii]s\\s+(${UC}(?:\\s+${UC}){1,2}?)(?=\\b)`),
    new RegExp(`(?:Bonjour|Salut|Hello),?\\s+(${UC}\\s+${UC})\\b`),
  );

  // ✅ VALIDATION: si le nom extrait est invalide → on vide pour forcer fallback AI
  if (!isValidProspectName(nom)) nom = '';

  // Téléphone
  let telephone = '';
  const telLabelMatch = fullWithFrom.match(/(?:t[eé]l[eé]phone|tel\.?|phone)\s*:?\s*((?:\+1[-.\s]?)?(?:\(\s*\d{3}\s*\)\s*\d{3}[-.\s]?\d{4}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4}))/i);
  if (telLabelMatch) telephone = telLabelMatch[1].replace(/[^\d+]/g, '').replace(/^1/, '');
  else {
    const telFallback = fullWithFrom.match(/\b((?:\+1[-.\s]?)?\d{3}[-.\s]\d{3}[-.\s]\d{4})\b/);
    if (telFallback) telephone = telFallback[1].replace(/[^\d+]/g, '').replace(/^1/, '');
  }
  if (!isValidPhone(telephone)) telephone = '';

  // Email — préférer label, puis scan avec filtres stricts
  let email = '';
  const emailLabelMatch = fullWithFrom.match(/(?:courriel|email|e-mail)\s*:?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  if (emailLabelMatch && isValidEmail(emailLabelMatch[1])) {
    email = emailLabelMatch[1].toLowerCase();
  }
  if (!email) {
    const emailRe = /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/g;
    const allEmails = [...fullWithFrom.matchAll(emailRe)]
      .map(m => m[1].toLowerCase())
      .filter(e => isValidEmail(e));
    email = allEmails[0] || '';
  }

  // Centris #
  const centris = extract(
    /\(#\s*(\d{7,9})\)/,
    /#\s*(\d{7,9})\b/,
    /(?:centris|mls|inscription|listing)[^\d]{0,60}(\d{7,9})\b/i,
    /\b(\d{8})\b/,
  );

  // Adresse
  const adresse = extract(
    /(?:adresse|propriét[eé]|property|address|bien)\s*:?\s*([^\n\r:;|<>]{10,80})/i,
    /\b(\d+[,\s]+(?:rue|avenue|boul\.?|chemin|ch\.|rang|route|rte|place|pl\.|cour|court|dr\.?|blvd)[^\n\r:;|<>]{5,60})/i,
  );

  // Type
  let type = 'terrain';
  const typeText = (full + ' ' + (adresse || '')).toLowerCase();
  if (/maison|unifamili|résidenti|bungalow|cottage|chalet/i.test(typeText))  type = 'maison_usagee';
  else if (/plex|duplex|triplex|quadruplex|multilogement/i.test(typeText))   type = 'plex';
  else if (/construction\s+neuve|neuve?|new\s+build/i.test(typeText))        type = 'construction_neuve';
  else if (/terrain|lot\b|land/i.test(typeText))                             type = 'terrain';

  // Score qualité du parsing (0-100)
  let score = 0;
  if (isValidProspectName(nom))  score += 35;
  if (isValidEmail(email))       score += 35;
  if (isValidPhone(telephone))   score += 20;
  if (centris)                   score += 10;

  return { nom, telephone, email, centris, adresse, type, _score: score };
}

// ─── AI FALLBACK ─────────────────────────────────────────────────────────────
// Appelle Claude Haiku si score regex < 70 (nom ou email manquant)
// Merge: regex est prioritaire, AI comble les vides
// ─────────────────────────────────────────────────────────────────────────────
async function parseLeadEmailWithAI(body, subject, from, regexResult, { apiKey, logger }) {
  if (!apiKey) return regexResult;
  const _log = logger || (() => {});

  // Si regex a tout (nom + email), pas besoin d'AI
  if (isValidProspectName(regexResult.nom) && isValidEmail(regexResult.email)) {
    _log('INFO', 'PARSER', `Score regex suffisant (${regexResult._score}) — skip AI`);
    return regexResult;
  }

  const clean = (body || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .substring(0, 4000);

  const prompt = `Tu es un extracteur de données pour leads immobiliers. Extrais UNIQUEMENT les infos du CLIENT (pas du courtier Shawn Barrette, pas de RE/MAX, pas de Centris).

IMPORTANT:
- Le courtier s'appelle "Shawn Barrette" — NE JAMAIS retourner ce nom comme prospect
- Si tu n'es pas sûr d'un champ, retourne ""
- Retourne UNIQUEMENT du JSON valide

SUJET: ${subject}
FROM: ${from}
CORPS: ${clean}

Format JSON attendu:
{"nom":"Prénom Nom du CLIENT uniquement","telephone":"10 chiffres ex 5149271340","email":"email du CLIENT uniquement","centris":"numéro 7-9 chiffres ou vide","adresse":"adresse propriété demandée ou vide","type":"terrain|maison_usagee|plex|construction_neuve"}`;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0]?.text || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { _log('WARN', 'PARSER_AI', 'Aucun JSON dans réponse AI'); return regexResult; }

    const ai = JSON.parse(jsonMatch[0]);
    _log('INFO', 'PARSER_AI', `AI extrait: nom=${ai.nom} email=${ai.email} tel=${ai.telephone}`);

    // ✅ Merge: regex prioritaire, AI comble si vide ET valide
    const merged = {
      nom:      isValidProspectName(regexResult.nom) ? regexResult.nom
                : (isValidProspectName(ai.nom) ? ai.nom : regexResult.nom),
      email:    isValidEmail(regexResult.email) ? regexResult.email
                : (isValidEmail(ai.email) ? ai.email.toLowerCase() : regexResult.email),
      telephone: isValidPhone(regexResult.telephone) ? regexResult.telephone
                : (isValidPhone(ai.telephone) ? ai.telephone.replace(/\D/g,'').replace(/^1/,'') : regexResult.telephone),
      centris:  regexResult.centris || ai.centris || '',
      adresse:  regexResult.adresse || ai.adresse || '',
      type:     regexResult.type || ai.type || 'terrain',
      _score:   regexResult._score,
      _aiUsed:  true,
    };

    // Validation finale: nom du courtier = échec parsing
    if (!isValidProspectName(merged.nom)) {
      _log('WARN', 'PARSER_AI', `Nom invalide après merge: "${merged.nom}" — prospect inconnu`);
      merged.nom = '';
    }

    return merged;
  } catch (e) {
    _log('ERR', 'PARSER_AI', `Erreur AI: ${e.message}`);
    return regexResult;
  }
}

module.exports = {
  detectLeadSource,
  isJunkLeadEmail,
  parseLeadEmail,
  parseLeadEmailWithAI,
  isValidProspectName,
  isValidEmail,
  isValidPhone,
};
