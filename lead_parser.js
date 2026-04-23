// lead_parser.js — Parser de leads email, extrait de bot.js pour testabilité
// Utilisé par bot.js (production) + test_parser.js (suite de tests)
// ─── PATCH 2026-04-24 ───────────────────────────────────────────────────────
// • Validation anti-faux-positifs (nom du courtier, mots génériques)
// • parseLeadEmailWithAI merge amélioré (AI comble regex, jamais l'inverse)
// • Exports centralisés pour bot.js
// ─── PATCH 2026-04-24b ──────────────────────────────────────────────────────
// • Blacklist numéro de Shawn (5149271340) dans isValidPhone
// • Détection notifications Realtor.ca "listing affichée" dans isJunkLeadEmail
//   (lead ID lead_1776970648487 — Route 337 Sainte-Julienne — notification listing auto)
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

// ─── Téléphones de l'équipe Signature SB — jamais un prospect ───────────────
// PATCH 2026-04-24b: blacklister numéros internes pour éviter faux leads
const AGENT_PHONES = [
  '5149271340', // Shawn Barrette
  '4509271340', // variante possible
];

function isValidProspectName(nom) {
  if (!nom || nom.length < 3) return false;
  const lower = nom.toLowerCase().trim();
  if (AGENT_NAMES.some(a => lower === a || lower.includes(a))) return false;
  if (GENERIC_WORDS.some(w => lower === w)) return false;
  const words = nom.trim().split(/\s+/);
  if (words.length < 2) return false;
  const allCap = words.every(w => /^[A-ZÀ-Ü]/.test(w));
  if (!allCap) return false;
  if (nom.length > 60) return false;
  return true;
}

function isValidEmail(email) {
  if (!email) return false;
  const lower = email.toLowerCase();
  const blocked = [
    'signaturesb', 'remax', 'centris', 'noreply', 'no-reply',
    'nepasrepondre', 'donotreply', 'info@', 'admin@', 'support@',
    'notification', 'brevo', 'brevosend', 'mailchimp',
  ];
  if (blocked.some(b => lower.includes(b))) return false;
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
}

function isValidPhone(tel) {
  if (!tel) return false;
  const digits = tel.replace(/\D/g, '');
  // 10 chiffres NA (ou 11 avec +1)
  const valid = digits.length === 10 || (digits.length === 11 && digits[0] === '1');
  if (!valid) return false;
  // ─── PATCH 2026-04-24b: rejeter numéros de l'équipe Signature SB ───────────
  const normalized = digits.length === 11 ? digits.slice(1) : digits;
  if (AGENT_PHONES.includes(normalized)) return false;
  // ────────────────────────────────────────────────────────────────────────────
  return true;
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

  // ─── PATCH 2026-04-24b: Notifications Realtor.ca/CREA "listing affichée" ───
  // Ces emails indiquent que TON listing a été publié sur Realtor.ca — PAS un prospect
  // Ex: "L'inscription pour l'adresse X est maintenant affichée sur REAL"
  //     "Your listing at X is now live on REALTOR.ca"
  //     "est maintenant affichée sur REAL" (truncated)
  if (/realtor|crea\.ca/i.test(f)) {
    // Notifications de statut d'inscription — pas un prospect
    if (/est maintenant affich[eé]e?\s+sur\s+real/i.test(sb)) return true;
    if (/is now (?:live|active|displayed)\s+on\s+real/i.test(sb)) return true;
    if (/inscription\s+pour\s+l'adresse.+affich/i.test(sb)) return true;
    if (/listing\s+(?:for|at|à).+(?:now live|active|published|affich)/i.test(sb)) return true;
    if (/votre\s+(?:inscription|listing)\s+est\s+(?:maintenant|désormais)/i.test(sb)) return true;
    if (/your\s+(?:listing|property)\s+(?:has been|is now)\s+(?:published|live|active)/i.test(sb)) return true;
    // Alertes de performance (vues, clics) sur Realtor.ca
    if (/(?:vues?|views?|clicks?|clics?|impressions?)\s+(?:sur|on)\s+(?:votre|your)\s+(?:inscription|listing)/i.test(sb)) return true;
    // Confirmation de soumission listing
    if (/(?:inscription|listing)\s+(?:soumise?|submitted|confirmée?|confirmed)/i.test(sb)) return true;
  }

  // Notifications REAL (CREA/Realtor backend)
  if (/\breal(?:tor)?\b.*\baffich/i.test(s)) return true;
  if (/est maintenant affich/i.test(s)) return true;

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

  // Email
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
    /(?:centris|mls|inscription|listing)[^\d]{0,10}(\d{7,9})\b/i,
    /\b(\d{8,9})\b/,
  );

  // Adresse
  const adresse = extract(
    /(?:adresse|address|propriété|property|inscription|listing)\s*:?\s*([^\n\r]{10,80})/i,
    /\b(\d{1,6}\s+(?:rue|chemin|boulevard|avenue|route|rang|ch\.|boul\.|blvd\.?)\s+[A-Za-zÀ-Üà-ü\s\-\'\.]{5,50})/i,
  );

  // Type propriété
  let type = 'terrain';
  const typeText = full.toLowerCase();
  if (/plex|duplex|triplex|quadruplex/i.test(typeText)) type = 'plex';
  else if (/construction\s+neuve|maison\s+neuve|neuve?\s+construction/i.test(typeText)) type = 'maison_neuve';
  else if (/maison|bungalow|cottage|résidence|résidentiel/i.test(typeText)) type = 'maison_usagee';
  else if (/terrain|lot\b|lott|land/i.test(typeText)) type = 'terrain';

  // Score qualité (0–100)
  let score = 0;
  if (nom) score += 35;
  if (email) score += 30;
  if (telephone) score += 20;
  if (centris) score += 10;
  if (adresse) score += 5;

  return { nom, email, telephone, centris, adresse, type, _score: score };
}

async function parseLeadEmailWithAI(body, subject, from, claudeClient) {
  // Phase 1: extraction regex
  const regexResult = parseLeadEmail(body, subject, from);

  // Si score suffisant, pas besoin d'AI
  if (regexResult._score >= 70) return regexResult;

  // Phase 2: fallback AI (Haiku — économique)
  if (!claudeClient) return regexResult;

  let clean = (body || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .substring(0, 3000); // limite tokens

  const prompt = `Tu es un parser de leads immobiliers pour Shawn Barrette (courtier RE/MAX).
Extrais ces infos de l'email ci-dessous et retourne UNIQUEMENT du JSON valide, rien d'autre.

IMPORTANT:
- "nom": prénom + nom du PROSPECT (client potentiel), PAS du courtier ni de l'agent
- Si c'est Shawn Barrette, Julie, ou un agent RE/MAX → laisser "nom": ""
- "email": email du PROSPECT uniquement (pas @signaturesb.com, @remax.ca, @centris.ca)
- "telephone": 10 chiffres canadiens du PROSPECT uniquement (pas 5149271340 qui est Shawn)
- "centris": numéro à 7-9 chiffres de la propriété demandée
- "adresse": adresse de la propriété (rue + ville)
- "type": "terrain" | "maison_usagee" | "maison_neuve" | "plex"

Format: {"nom":"","email":"","telephone":"","centris":"","adresse":"","type":"terrain"}

Email:
Sujet: ${subject || ''}
De: ${from || ''}
Corps: ${clean}`;

  try {
    const response = await claudeClient.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const aiText = response.content?.[0]?.text?.trim() || '';
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return regexResult;

    const aiResult = JSON.parse(jsonMatch[0]);

    // Merge: regex a priorité, AI comble seulement ce qui est vide
    // Valider chaque champ AI avant de l'utiliser
    const merged = { ...regexResult };
    if (!merged.nom && aiResult.nom && isValidProspectName(aiResult.nom)) {
      merged.nom = aiResult.nom;
    }
    if (!merged.email && aiResult.email && isValidEmail(aiResult.email)) {
      merged.email = aiResult.email.toLowerCase();
    }
    if (!merged.telephone && aiResult.telephone && isValidPhone(aiResult.telephone)) {
      merged.telephone = aiResult.telephone.replace(/\D/g, '').replace(/^1/, '');
    }
    if (!merged.centris && aiResult.centris) merged.centris = aiResult.centris;
    if (!merged.adresse && aiResult.adresse) merged.adresse = aiResult.adresse;
    if (aiResult.type) merged.type = aiResult.type;

    // Recalculer score
    merged._score = 0;
    if (merged.nom) merged._score += 35;
    if (merged.email) merged._score += 30;
    if (merged.telephone) merged._score += 20;
    if (merged.centris) merged._score += 10;
    if (merged.adresse) merged._score += 5;

    return merged;
  } catch (e) {
    // AI a échoué → retourner résultat regex
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
  LEAD_EMAIL_PATTERNS,
  LEAD_SUBJECT_RE,
  AGENT_PHONES,
};
