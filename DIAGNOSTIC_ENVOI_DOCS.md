# 🔴 DIAGNOSTIC COMPLET — Envoi de documents cassé
**Date:** 2026-05-20  
**Priorité:** CRITIQUE — Shawn ne peut pas envoyer de docs aux prospects  
**À lire par:** Claude Code (Mac de Shawn)

---

## 🚨 PROBLÈMES IDENTIFIÉS (dans l'ordre de priorité)

---

### BUG #1 — CRASH `m is not defined` (ligne 11744)
**Sévérité:** P0 — crash uncaughtException toutes les quelques heures  
**Confirmé via:** CRASH_REPORT.md (2026-05-20 05h59)

```
ReferenceError: m is not defined
    at Timeout._onTimeout (bot.js:11744:20)
```

**Cause:** Une variable `m` est utilisée dans un `setTimeout` ou `setInterval` callback, mais `const m` est déclarée **après** le closure (hoist manquant ou déclaration dans le mauvais scope).

**Fix:**
```js
// AVANT (cassé) — m déclaré hors du callback
setInterval(async () => {
  const result = m.something(); // m pas encore défini ici
}, 60000);
const m = { ... }; // trop tard

// APRÈS (correct)
const m = { ... }; // déplacer AVANT setInterval
setInterval(async () => {
  const result = m.something();
}, 60000);
```

**Action:** Aller à la ligne ~11744 de bot.js, identifier le setInterval/setTimeout, déplacer la déclaration de `m` au-dessus.

---

### BUG #2 — Centris OAuth bloqué au MFA SMS (critique pour fiches Centris)
**Sévérité:** P0 — aucun envoi de fiche Centris native ne fonctionne  
**Confirmé via:** Logs boot CRASH_REPORT.md

```
WARN|CENTRIS-OAUTH|hop 5 STUCK at https://centris-prod.ca.auth0.com/u/mfa-sms-challenge
WARN|CENTRIS|OAuth flow échoué: Pas de form_post matrix après auth — fallback form-based
WARN|CENTRIS|Login: HTTP 200 — location: (vide)
WARN|CENTRIS|Pré-login échoué — retry automatique à la première requête
```

**Cause:** Auth0 exige un code SMS (MFA) que le bot ne peut pas intercepter.

**Solutions (dans l'ordre):**

**Option A — TOTP (recommandé, 0$ sans SMS):**
1. Sur Mac de Shawn → se connecter à centris.ca manuellement
2. Aller dans Paramètres → Sécurité → Authentification à deux facteurs
3. Choisir "Application d'authentification" (Google Authenticator / Authy)
4. Scanner le QR code → copier le **secret base32** (visible sous le QR)
5. Dans Render → ajouter env var: `CENTRIS_TOTP_SECRET=LE_SECRET_BASE32`
6. Le bot utilise déjà `otpauth` (installé) pour générer les codes TOTP

**Option B — Désactiver MFA temporairement (moins sécurisé):**
- Centris → Paramètres → désactiver l'authentification à deux facteurs
- ⚠️ Risque sécurité — déconseillé pour compte agent

**Option C — Bridge SMS (solution actuelle partiellement implémentée):**
- Nécessite un pont entre le SMS reçu sur iPhone et le bot
- Complexe — ne pas prioriser si Option A est faisable

---

### BUG #3 — `envoyer_docs_prospect` — flow complet à auditer
**Sévérité:** P1 — envoi docs Dropbox peut échouer silencieusement

**Ce qu'il faut vérifier dans bot.js:**

#### 3a. Match Dropbox → Centris
```js
// Vérifier que matchDropboxAvance() retourne bien les bons dossiers
// Test: chercher_listing_dropbox("Rawdon") → doit trouver listings
// La structure Dropbox a 83 dossiers indexés (confirmé au boot)
```

#### 3b. Téléchargement PDF depuis Dropbox
```js
// Vérifier que downloadDropboxFile() ne timeout pas
// Dropbox token se refresh toutes les 4h — confirmer que le token est valide
// avant de télécharger (pas après)
```

#### 3c. Envoi email avec PJ Gmail
```js
// La limite est 24MB — vérifier qu'elle est respectée
// Gmail API nécessite que les PJs soient encodées en base64
// Vérifier que GMAIL_REFRESH_TOKEN est toujours valide (expire si pas utilisé)
```

#### 3d. Résolution email prospect depuis Pipedrive
```js
// Vérifier que l'outil cherche bien l'email du prospect dans Pipedrive
// avant d'essayer d'envoyer
// Si email absent → afficher erreur claire à Shawn (pas crash silencieux)
```

**Fix recommandé:** Ajouter logs explicites à chaque étape:
```js
log('INFO', 'ENVOI_DOCS', `Step 1: match Dropbox pour ${centrisNum}`);
log('INFO', 'ENVOI_DOCS', `Step 2: ${pdfs.length} PDFs trouvés`);
log('INFO', 'ENVOI_DOCS', `Step 3: téléchargement ${totalMB}MB`);
log('INFO', 'ENVOI_DOCS', `Step 4: envoi Gmail à ${email}`);
log('OK',   'ENVOI_DOCS', `✅ Envoyé — ${pdfs.length} PJs`);
```

---

### BUG #4 — `envoyer_fiche_centris_native` non fonctionnel (dépend de #2)
**Sévérité:** P1 — bloqué par MFA Centris

**Flow actuel:**
1. Se connecter à Matrix Centris → ❌ BLOQUÉ par MFA SMS
2. Naviguer vers listing → ❌ Jamais atteint
3. Imprimer PDF → ❌ Jamais atteint
4. Envoyer par email → ❌ Jamais atteint

**Fix:** Résoudre BUG #2 (TOTP) → ce flow marchera automatiquement

---

### BUG #5 — `telecharger_annexes_centris` / `telecharger_fiche_centris`
**Sévérité:** P1 — même blocage que #4

**Note:** Ces outils dépendent tous de l'authentification Centris. Fix #2 → fix #4 + #5 simultanément.

---

### BUG #6 — Activités auto génériques créées par le bot (P2)
**Sévérité:** P2 — spam dans Pipedrive de Shawn, nuit à l'organisation

**Problème:** Le bot crée automatiquement des activités "Appeler Contact", "Suivi prospect" dans:
- `traiterNouveauLead()`
- `enregistrer_resume_appel()`
- `creerDeal()`

**Décision Shawn (2026-05-20):** DÉSACTIVER complètement la création auto d'activités.

**Fix:**
```js
// Dans traiterNouveauLead() — SUPPRIMER ou commenter le bloc creerActivite()
// Dans enregistrer_resume_appel() — SUPPRIMER le bloc createActivity
// Dans creerDeal() — SUPPRIMER la création d'activité de suivi automatique
// GARDER uniquement: création de notes Pipedrive (notes = OK, activités = NON)
```

**Constante à ajouter (déjà dans SESSION_LIVE):**
```js
const SHAWN_GERE_SES_SUIVIS = true; // Désactive création auto activités Pipedrive
```

---

## ✅ ÉTAT DES CHOSES QUI MARCHENT (ne pas toucher)

| Feature | Status | Notes |
|---|---|---|
| Index Dropbox au boot | ✅ | 83 dossiers, 400 fichiers |
| Gmail Lead Poller | ✅ | Scan 30s, 405 processed |
| Pipedrive (deals/notes/étapes) | ✅ | Toutes opérations OK |
| Brevo campagnes | ✅ | 5 campagnes planifiées |
| Transcription vocale Whisper | ✅ | |
| Vision photos/PDFs (Claude natif) | ✅ | |
| Dropbox token refresh | ✅ | Toutes les 4h |
| Scrapers web (Firecrawl + Playwright) | ✅ | |
| Webhook Telegram auto-heal | ✅ | |

---

## 📋 PLAN D'ACTION — Dans l'ordre

### Étape 1 (15 min) — Fix crash `m is not defined`
- [ ] Aller ligne ~11744 bot.js
- [ ] Identifier la var `m` et son closure
- [ ] Déplacer déclaration avant le setInterval
- [ ] Tester localement
- [ ] `git commit -m "fix(crash): m is not defined ligne 11744"`
- [ ] Push → Render redéploie → vérifier plus de crash dans logs

### Étape 2 (30 min) — Fix Centris MFA → TOTP
- [ ] Shawn active TOTP sur son compte Centris (sur son Mac)
- [ ] Copier le secret base32
- [ ] Ajouter `CENTRIS_TOTP_SECRET` dans Render env vars
- [ ] Vérifier que `otpauth` est importé dans bot.js (déjà installé)
- [ ] Implémenter `generateTOTP()` si pas déjà fait:
```js
const { TOTP } = require('otpauth');
function generateCentrisTOTP() {
  if (!process.env.CENTRIS_TOTP_SECRET) return null;
  const totp = new TOTP({ secret: process.env.CENTRIS_TOTP_SECRET });
  return totp.generate();
}
```
- [ ] Injecter le code TOTP dans le flow OAuth Centris au lieu d'attendre SMS
- [ ] Tester: `envoyer_fiche_centris_native` avec un vrai Centris#
- [ ] `git commit -m "fix(centris): TOTP MFA bypass SMS"`

### Étape 3 (20 min) — Désactiver activités auto Pipedrive
- [ ] Chercher `creerActivite` / `createActivity` dans traiterNouveauLead, enregistrer_resume_appel, creerDeal
- [ ] Commenter / supprimer les appels (pas les fonctions elles-mêmes)
- [ ] Garder `ajouter_note` intact
- [ ] `git commit -m "fix(pipedrive): désactiver activités auto — SHAWN_GERE_SES_SUIVIS"`

### Étape 4 (20 min) — Audit et logs envoi docs
- [ ] Ajouter logs step-by-step dans `envoyer_docs_prospect`
- [ ] Tester manuellement avec un vrai prospect
- [ ] Vérifier GMAIL_REFRESH_TOKEN est valide (test: envoyer email test à shawn@signaturesb.com)
- [ ] `git commit -m "feat(docs): logs détaillés envoi docs + validation email"`

---

## 🔍 COMMENT TESTER APRÈS FIX

```bash
# Test 1: Plus de crash
# → Surveiller Render logs 30 min → zero ReferenceError

# Test 2: Centris TOTP
# → Dans Telegram: "envoie la fiche du #12162098 à shawn@signaturesb.com"
# → Doit recevoir le PDF dans 30 secondes

# Test 3: Envoi docs Dropbox
# → Dans Telegram: "envoie les docs à Noella Verbiest"
# → Doit matcher dossier Dropbox, envoyer PDFs à noella.verbiest@gmail.com

# Test 4: Plus d'activités auto
# → Créer un nouveau deal test
# → Vérifier dans Pipedrive: notes OK, ZERO activité "Appeler Contact" créée auto
```

---

## 📂 FICHIERS À MODIFIER

1. `bot.js` — fixes #1, #3, #4, #6
2. Render env vars — ajouter `CENTRIS_TOTP_SECRET`
3. `SESSION_LIVE.md` — mettre à jour après chaque fix

---

## ⚠️ NE PAS TOUCHER

- System prompt (INSTRUCTIONS_CLAUDE_CODE.md règle #3)
- Credentials Gmail/Dropbox existants (fonctionnels)
- Structure Pipedrive
- Les outils qui marchent déjà (voir tableau ci-dessus)

---

**Écrit par:** Bot Kira (diagnostic automatique)  
**Prochain step:** Claude Code implémente dans l'ordre Étape 1 → 2 → 3 → 4
