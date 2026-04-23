# 🔒 LEAD FLOW — PATCH FINAL DÉFINITIF
**Créé:** 2026-04-24  
**Statut:** À IMPLÉMENTER dans bot.js (session Claude Code)  
**Objectif:** Flux Centris → prospect 100% fiable, zéro panne silencieuse

---

## 🎯 RÉSUMÉ — 4 PATCHES DANS BOT.JS

| # | Fonction | Problème | Fix |
|---|----------|----------|-----|
| P1 | `traiterNouveauLead()` | Nom invalide → deal "Shawn Barrette" créé | Validation + pending + alerte Shawn |
| P2 | `envoyerDocsAuto()` | Échec silencieux → prospect ne reçoit rien | Retry 3x + alerte Telegram si échec |
| P3 | Envoi email (Gmail) | Shawn en Cc visible par client | Passer en Bcc invisible |
| P4 | `pendingLeads` | Pas de système pour leads incomplets | Stocker + commande `/pending` améliorrée |

---

## P1 — VALIDATION NOM AVANT DEAL

**Chercher dans bot.js:** `async function traiterNouveauLead(`  
**Chercher la ligne où on crée le deal:** `await tools.creer_deal(` ou `creerDeal(`

**AVANT de créer le deal, insérer:**

```javascript
// ─── PATCH P1: Validation nom prospect ───────────────────────────────────────
const { isValidProspectName } = require('./lead_parser');

// Si nom invalide → ne PAS créer de deal au nom du courtier
if (!parsed.nom || !isValidProspectName(parsed.nom)) {
  log('WARN', 'LEAD', `Nom non identifié (valeur: "${parsed.nom}") — lead mis en pending`);
  
  // Stocker en pending pour résolution manuelle
  const pendingEntry = {
    id: `pending_${Date.now()}`,
    ts: Date.now(),
    email: parsed.email || '',
    telephone: parsed.telephone || '',
    centris: parsed.centris || '',
    adresse: parsed.adresse || '',
    type: parsed.type || 'terrain',
    source: parsed.source || 'centris',
    needsName: true,
    rawSubject: subject || '',
  };
  
  if (!global.pendingLeads) global.pendingLeads = [];
  global.pendingLeads.push(pendingEntry);
  
  // Sauvegarder pendingLeads sur disque
  try {
    const PENDING_FILE = path.join(DATA_DIR, 'pending_leads.json');
    fs.writeFileSync(PENDING_FILE, JSON.stringify(global.pendingLeads, null, 2));
  } catch(e) { log('WARN', 'LEAD', `Impossible sauvegarder pending: ${e.message}`); }
  
  // Alerte Telegram immédiate
  const alertMsg = [
    `⚠️ *Lead reçu — nom non identifié*`,
    ``,
    `📧 Email: ${parsed.email || '?'}`,
    `📞 Tél: ${parsed.telephone || '?'}`,
    `🏡 Centris: ${parsed.centris ? `#${parsed.centris}` : '?'}`,
    `📍 Adresse: ${parsed.adresse || '?'}`,
    ``,
    `❓ Quel est le nom du prospect?`,
    `Réponds: \`nom [Prénom Nom]\` pour créer le deal.`,
    ``,
    `ID: \`${pendingEntry.id}\``,
  ].join('\n');
  
  await sendTelegram(ALLOWED_ID, alertMsg, { parse_mode: 'Markdown' });
  return; // STOP — ne pas créer deal incomplet
}
// ─── FIN PATCH P1 ─────────────────────────────────────────────────────────────
```

---

## P2 — RETRY ENVOI DOCS (wrapper résilient)

**Chercher dans bot.js:** `async function envoyerDocsAuto(`  
**Juste APRÈS la déclaration de la fonction (première ligne du body)**, ajouter le wrapper.

**OU: Créer une nouvelle fonction juste AVANT `envoyerDocsAuto`:**

```javascript
// ─── PATCH P2: Wrapper retry résilient pour envoi docs ────────────────────────
async function alertShawnDocsFailed(prospect, err) {
  const nom = prospect?.nom || prospect?.email || prospect?.telephone || 'Inconnu';
  const msg = [
    `🚨 *DOCS NON ENVOYÉS — ACTION REQUISE*`,
    ``,
    `👤 Prospect: ${nom}`,
    `📧 Email: ${prospect?.email || '?'}`,
    `🏡 Terrain: ${prospect?.adresse || prospect?.centris || '?'}`,
    ``,
    `❌ Erreur: ${err?.message || String(err)}`,
    ``,
    `▶️ Pour réessayer: "envoie les docs à ${nom}"`,
  ].join('\n');
  
  try {
    await sendTelegram(ALLOWED_ID, msg, { parse_mode: 'Markdown' });
  } catch(e) {
    log('ERR', 'ALERT', `Impossible envoyer alerte Telegram: ${e.message}`);
  }
}

async function envoyerDocsAutoResilient(prospect, docsPath, tentative = 0) {
  const MAX_TENTATIVES = 3;
  const DELAYS_MS = [0, 30000, 120000]; // 0s, 30s, 2min
  
  try {
    return await envoyerDocsAuto(prospect, docsPath);
  } catch(err) {
    if (tentative < MAX_TENTATIVES - 1) {
      const delai = DELAYS_MS[tentative + 1];
      log('WARN', 'DOCS', `Tentative ${tentative + 1}/${MAX_TENTATIVES} échouée: ${err.message} — retry dans ${delai/1000}s`);
      await new Promise(r => setTimeout(r, delai));
      return envoyerDocsAutoResilient(prospect, docsPath, tentative + 1);
    }
    // Toutes les tentatives épuisées → alerte immédiate
    log('ERR', 'DOCS', `ÉCHEC DÉFINITIF après ${MAX_TENTATIVES} tentatives: ${err.message}`);
    await alertShawnDocsFailed(prospect, err);
    throw err;
  }
}
// ─── FIN PATCH P2 ─────────────────────────────────────────────────────────────
```

**Puis remplacer TOUS les appels à `envoyerDocsAuto(` par `envoyerDocsAutoResilient(`**  
Faire un find+replace global dans bot.js.  
**Exception:** ne pas remplacer la définition `async function envoyerDocsAuto(` elle-même.

---

## P3 — BCC INVISIBLE (Shawn ne doit pas apparaître dans les destinataires)

**Chercher dans bot.js:** `cc: SHAWN_EMAIL` ou `'Cc'` ou `Cc:` dans les headers Gmail

**Pattern actuel (variant possible):**
```javascript
// VARIANT A — dans le raw MIME:
Cc: ${SHAWN_EMAIL}

// VARIANT B — dans gmailSend payload:
cc: SHAWN_EMAIL,

// VARIANT C — dans headers object:
headers: { 'Cc': SHAWN_EMAIL }
```

**Remplacer par Bcc dans TOUS les cas:**

```javascript
// DANS LE RAW MIME (chercher les backtick templates avec les headers):
// Remplacer:  Cc: ${SHAWN_EMAIL}
// Par:        Bcc: ${SHAWN_EMAIL}

// DANS LES OBJETS GMAIL API:
// Remplacer:  cc: SHAWN_EMAIL,
// Par:        bcc: SHAWN_EMAIL,
// (dans la fonction qui construit le payload Gmail)
```

**Note importante:** 
- Gmail API `users.messages.send` avec raw MIME = utiliser `Bcc:` dans les headers
- Gmail API avec `to/cc/bcc` séparés = utiliser le champ `bcc`
- Dans les deux cas, Bcc n'apparaît PAS dans les emails reçus par le client ✅

---

## P4 — COMMANDE /PENDING AMÉLIORÉE

**Chercher dans bot.js:** `/pending` ou la section qui gère cette commande.

**Ajouter/améliorer le handler:**

```javascript
// ─── PATCH P4: /pending amélioré ─────────────────────────────────────────────
// Ajouter au boot (après DATA_DIR défini):
const PENDING_FILE = path.join(DATA_DIR, 'pending_leads.json');
if (!global.pendingLeads) {
  try {
    global.pendingLeads = fs.existsSync(PENDING_FILE) 
      ? JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'))
      : [];
  } catch(e) { global.pendingLeads = []; }
}

// Handler commande "nom [Prénom Nom]" pour compléter un lead pending:
// Dans le switch/if des commandes Telegram, ajouter:
if (/^nom\s+([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)+)/i.test(text)) {
  const nomMatch = text.match(/^nom\s+(.+)/i);
  const nomProspect = nomMatch?.[1]?.trim();
  
  if (!nomProspect || !global.pendingLeads?.length) {
    await send(chatId, '❌ Aucun lead pending ou nom invalide.');
    return;
  }
  
  // Prendre le dernier pending needsName
  const pending = global.pendingLeads.find(l => l.needsName);
  if (!pending) {
    await send(chatId, '✅ Aucun lead en attente de nom.');
    return;
  }
  
  pending.nom = nomProspect;
  pending.needsName = false;
  
  // Sauvegarder
  fs.writeFileSync(PENDING_FILE, JSON.stringify(global.pendingLeads, null, 2));
  
  // Créer le deal avec le vrai nom
  await send(chatId, `⏳ Création deal: ${nomProspect}...`);
  try {
    // Appeler la logique de création deal existante avec parsed complet
    await traiterNouveauLeadAvecNom(pending);
    await send(chatId, `✅ Deal créé: *${nomProspect}*`, { parse_mode: 'Markdown' });
  } catch(e) {
    await send(chatId, `❌ Erreur création deal: ${e.message}`);
  }
  return;
}
// ─── FIN PATCH P4 ─────────────────────────────────────────────────────────────
```

---

## 🔄 ORDRE D'APPLICATION

1. **P3 en premier** (le plus simple — find+replace Cc→Bcc)
2. **P2** (ajouter alertShawnDocsFailed + envoyerDocsAutoResilient AVANT envoyerDocsAuto)
3. **P1** (dans traiterNouveauLead — validation nom)
4. **P4** (amélioration /pending)

---

## ✅ VALIDATION POST-DEPLOY

Après chaque patch et `git push`:
1. Attendre ~90s
2. `curl https://signaturesb-bot-s272.onrender.com/` → doit répondre
3. `curl https://signaturesb-bot-s272.onrender.com/health` → tools count = 40+
4. Envoyer `/checkemail` dans Telegram → doit scanner sans crash
5. Test lead réel: `/forcelead [id_gmail_recent]` → vérifier parsing + alerte

---

## 🚫 RÈGLES ABSOLUES

- **NE PAS** créer de deal si `isValidProspectName(nom) === false`
- **NE PAS** utiliser Cc (visible) — toujours Bcc pour Shawn
- **NE PAS** laisser un échec d'envoi docs silencieux — toujours alerter Telegram
- **NE PAS** stocker `pending_leads.json` avec des noms d'agent dedans

---

## 📊 ÉTAT ACTUEL (avant patch)

| Système | État |
|---------|------|
| lead_parser.js — validation | ✅ Fait |
| bot.js — P1 validation nom | ❌ À faire |
| bot.js — P2 retry docs | ❌ À faire |
| bot.js — P3 Bcc | ❌ À faire |
| bot.js — P4 /pending amélioré | ❌ À faire |

---

*Pour Claude Code: lire ce fichier + LEÇONS.md + ÉTAT_SYSTÈME.md avant de commencer.*  
*One phase at a time. Test local. Push. Validate /health. Repeat.*
