# SIGNATURE SB — Contexte Maître pour Claude Code

> Chargé automatiquement à chaque session. Reprendre ici sans contexte supplémentaire.
> Dernier commit: cua_driver | bot.js: 2996 lignes | 40 outils actifs

---

## IDENTITÉ

**Shawn Barrette** — Courtier immobilier RE/MAX PRESTIGE Rawdon  
514-927-1340 · shawn@signaturesb.com · signatureSB.com  
Assistante: Julie (julie@signaturesb.com)

## RÔLE DE CLAUDE CODE

Architecte + développeur principal du bot Telegram. Tutoiement. Français. Toujours commiter après chaque modification. `node --check bot.js` avant tout commit.

---

## BOT TELEGRAM — PRODUCTION

| Élément | Valeur |
|---|---|
| Fichier | `/Users/signaturesb/Documents/github/Claude, code Telegram/bot.js` |
| Render | srv-d7fh9777f7vs73a15ddg |
| URL | signaturesb-bot-s272.onrender.com |
| Render API Key | `$RENDER_API_KEY` (env var — jamais en clair ici) |
| Repo GitHub | signaturesb/bot-assistant |
| Modèle | claude-opus-4-7 (défaut) |
| Outils | 40 actifs |
| Lignes | 2996 |

---

## FONCTIONNALITÉS ACTIVES

### Gmail Lead Poller (commit 3b10a9e)
- Scan toutes les **5 minutes** : Centris.ca, RE/MAX Québec, Realtor.ca, DuProprio, demandes directes
- `parseLeadEmail()` : extrait nom, tel, email, Centris#, adresse, type — tous formats
- `traiterNouveauLead()` : deal Pipedrive + docs Dropbox + brouillon J+0 → notif Telegram
- État persisté : `/data/gmail_poller.json` (lastRun, processed[], totalLeads)
- Démarrage : 8s après boot (scan 6h arrière) + interval 5min
- `/checkemail` : force scan 48h
- `/poller` : statut + stats

### CUA Driver — Centris PDF via Computer Use (cua_driver.js)
Résout définitivement le bug "PDF Matrix Centris inaccessible (URLs 2026 changées)".

**Architecture:**
- Playwright Chromium headless → screenshots → Claude CUA (computer-use-2024-10-22) → actions
- Boucle: screenshot → Claude décide → click/type/scroll → screenshot → repeat (max 25 steps)
- Cache session Centris cookies → `/data/cua_session.json` (12h, re-login auto si expiré)
- Cache PDF → `/data/cua_pdfs/centris_{num}_fiche.pdf` (24h)
- MFA SMS: lit `/data/centris_mfa.txt` écrit par sms-bridge LaunchAgent (max 90s)
- Cleanup automatique screenshots + PDFs > 7j

**Installation unique (1 fois sur Render ou Mac):**
```bash
npm install playwright
npx playwright install chromium --with-deps
```

**API publique:**
```javascript
const { cuaGetCentrisPDF, cuaGetCentrisAnnexes, cuaNavigate, cuaStatus, CUA_AVAILABLE } = require('./cua_driver');

// Fiche principale
const r = await cuaGetCentrisPDF('22264330');
// → { success, buffer, filename, message, fromCache }

// Annexes (DV, certificat, plans)
const a = await cuaGetCentrisAnnexes('22264330', 'DV');
// → { success, annexes: [{buffer, filename}], message }

// Tâche générique
const g = await cuaNavigate('Trouve le prix de la propriété #12345678', 'https://...');

// Status pour /health
cuaStatus() → { available, playwright, session, cachedPDFs, maxSteps }
```

**Intégration dans bot.js (à faire):**
```javascript
// En haut de bot.js, après les autres requires:
const { cuaGetCentrisPDF, cuaGetCentrisAnnexes, CUA_AVAILABLE } = require('./cua_driver');

// Dans telechargerFicheCentris() — ajouter comme stratégie 2 (avant fallback lien public):
if (CUA_AVAILABLE()) {
  const cuaResult = await cuaGetCentrisPDF(centrisNum);
  if (cuaResult.success && cuaResult.buffer) {
    // Envoyer cuaResult.buffer par email comme PJ
    return await envoyerPDFParEmail(cuaResult.buffer, cuaResult.filename, emailDest, centrisNum);
  }
}

// Dans telechargerAnnexesCentris() — même pattern:
if (CUA_AVAILABLE()) {
  const cuaResult = await cuaGetCentrisAnnexes(centrisNum, filtre);
  if (cuaResult.success) {
    // cuaResult.annexes[].buffer → envoyer par email
  }
}

// Dans /health:
cua: cuaStatus(),
```

**Fallback chain complet (après intégration):**
1. Try URLs Matrix legacy (peut marcher)
2. **CUA Playwright + Claude Computer Use** ← nouveau
3. Fallback: email pro avec lien Centris public + photos (déjà en place)

**Env var requise (déjà présente):** `ANTHROPIC_API_KEY`
**Env vars Centris (déjà présentes):** `CENTRIS_USER`, `CENTRIS_PASS`
**Nouvelle dépendance:** `playwright` (npm install)

### 40 Outils Pipedrive (14)
`voir_pipeline` `chercher_prospect` `voir_prospect_complet` `marquer_perdu` `ajouter_note` `stats_business` `creer_deal` `planifier_visite` `voir_visites` `changer_etape` `voir_activites` `modifier_deal` `creer_activite` `prospects_stagnants`

### Gmail (3)
`voir_emails_recents` `voir_conversation` `envoyer_email`

### Dropbox (5)
`list_dropbox_folder` `read_dropbox_file` `send_dropbox_file` `chercher_listing_dropbox` `envoyer_docs_prospect`

### Mobile/Contacts (3)
`chercher_contact` `historique_contact` `repondre_vite`

### Autres (15)
GitHub(4) · Brevo(1) · Recherche(1) · Bot files(2) · Diagnostics(2) · `voir_visites`(1) · `voir_activites`(1) + 3

### Vision + Audio
Photos (propriétés/terrains/contrats) · PDFs (offres/rapports) · Vocaux Whisper

### Webhooks intelligents
`/webhook/centris` `/webhook/sms` `/webhook/reply` — auto-créent deals + brouillons

### Crons quotidiens
- 7h: rappelVisitesMatin → Telegram
- 8h: runDigestJulie → Brevo → julie@signaturesb.com
- 18h: syncStatusGitHub → BOT_STATUS.md → repo bot-assistant
- (9h: J+1/J+3/J+7 — SUR GLACE)
- 5min: Gmail Lead Poller (continu)
- 30min: reload structure Dropbox
- 3h: refresh token Dropbox

---

## FLOWS CRITIQUES — ÉTAT PARFAIT

### Email (Gmail → fallback Brevo automatique)
1. `envoyer_email` → stocke dans `pendingEmails`
2. CONFIRM_REGEX: `envoie` `go` `parfait` `ok` `d'accord` `ça marche` `send`
3. Essaie Gmail (token null-safe) → si fail: Brevo auto
4. Supprime pendingEmails SEULEMENT après succès

### Docs Dropbox
1. Cherche deal → Centris → dossier `/Terrain en ligne/`
2. Vérifie taille ≤ 24MB
3. Gmail avec PJ + note Pipedrive honnête

### Centris PDF (chain complète post-CUA)
1. Pré-check listing existe (Centris public)
2. Try URLs Matrix legacy
3. **CUA: Playwright + Claude Computer Use → PDF réel**
4. Fallback: email avec lien public Centris.ca

### Création deal
1. Cherche personne existante avant créer
2. Note consolidée (tel + email + source)
3. Warning si person fail

---

## ARCHITECTURE TECHNIQUE

### Prompt caching (optimisé)
- `SYSTEM_BASE` (statique ~3500 chars) : toujours caché
- `getSystemDynamic()` (Dropbox + mémoire) : jamais caché
- Réduit cache misses ~80%

### Sécurité
- `WEBHOOK_SECRET` : validé sur tous les webhooks
- `isDuplicate()` : Map FIFO (max 2000 entrées)
- `executeToolSafe()` : timeout 30s par outil

### CUA Driver (cua_driver.js)
- Lazy-load Playwright (require.resolve avant require)
- `CUA_AVAILABLE()` → check sans throw
- Session cookies 12h → `/data/cua_session.json`
- PDF cache 24h → `/data/cua_pdfs/`
- Screenshots debug → `/data/cua_screenshots/`
- Max 25 steps par tâche (protection boucle infinie)
- MFA bridge: lit `/data/centris_mfa.txt` (LaunchAgent sms-bridge)
- Cleanup automatique fichiers > 7j via `cuaCleanup()`

### `AGENT_CONFIG` — SaaS multi-courtier
Toutes valeurs courtier en env vars Render. Zero hardcodé.
`AGENT_NOM` `AGENT_TEL` `AGENT_COMPAGNIE` `AGENT_REGION` `AGENT_COULEUR` `DBX_TERRAINS` etc.

### Dropbox
- Token refresh: boot + 3h
- Structure: boot + 30min
- Cache `dropboxTerrains[]`: {name, path, centris, adresse}

### Gmail
- Token null-safe (retourne null, jamais throw)
- `gmailRefreshInProgress` mutex
- Fallback Brevo auto si Gmail fail

---

## PIPEDRIVE — Pipeline ID: 7

Étapes: 49→50→51→52→53→54→55

Champs custom:
- Type: `d8961ad7b8b9bf9866befa49ff2afae58f9a888e` (T=37,CN=38,MN=39,MU=40,P=41)
- Séquence: `17a20076566919bff80b59f06866251ed250fcab` (Oui=42,Non=43)
- Centris: `22d305edf31135fc455a032e81582b98afc80104`
- Suivi J+1/J+3/J+7: fields (SUR GLACE)

---

## MAILING-MASSE

`/Users/signaturesb/Documents/github/mailing-masse/` → `node launch.js`  
5 campagnes: VENDEURS(L3-7) ACHETEURS(L5) PROSPECTS(L4) TERRAINS(L8) RÉFÉRENCEMENT(L3,6,7)  
Template local: `~/Dropbox/Liste de contact/email_templates/master_template_signature_sb.html`  
Brevo template ID 43 = version bot. **JAMAIS modifier logos base64.**

---

## ENV VARS RENDER (22+)

```
TELEGRAM_BOT_TOKEN  TELEGRAM_ALLOWED_USER_ID=5261213272
ANTHROPIC_API_KEY   OPENAI_API_KEY
PIPEDRIVE_API_KEY   BREVO_API_KEY
GMAIL_CLIENT_ID     GMAIL_CLIENT_SECRET    GMAIL_REFRESH_TOKEN
DROPBOX_ACCESS_TOKEN DROPBOX_REFRESH_TOKEN DROPBOX_APP_KEY DROPBOX_APP_SECRET
SHAWN_EMAIL  JULIE_EMAIL  GIST_ID  GITHUB_TOKEN  WEBHOOK_SECRET
SIRF_USER  SIRF_PASS  (valeurs en env vars — jamais en clair ici)
CENTRIS_USER  CENTRIS_PASS  (déjà présents)
```

**RÈGLE CRITIQUE :** `PUT /services/{id}/env-vars` remplace TOUTES — toujours envoyer la liste complète.

---

## RÈGLES ABSOLUES

1. `node --check bot.js` avant tout commit
2. Ne jamais modifier logos base64 dans le master template Brevo
3. Toujours tester emails à shawn@signaturesb.com avant envoi masse
4. Cause perdue = `PUT status:lost`, jamais DELETE
5. Render PUT env-vars = remplace tout → envoyer liste complète
6. J+1/J+3/J+7 SUR GLACE (décommenter cron ~ligne 2425 pour réactiver)

---

## CONNEXION BOT ↔ CLAUDE CODE

- Bot écrit `BOT_STATUS.md` → GitHub repo `signaturesb/bot-assistant` chaque soir 18h
- Lire: `read_github_file(repo='bot-assistant', path='BOT_STATUS.md')`
- Gmail Poller écrit `gmail_poller.json` → `/data/` sur Render
- SESSION_LIVE.md → kira-bot (Claude Code écrit, bot Telegram lit toutes 30min)

---

## PROCHAINE SESSION — INTÉGRATION CUA DANS bot.js

**cua_driver.js est prêt. Il faut maintenant l'intégrer dans bot.js:**

### Étape 1 — Installer Playwright (1 commande)
```bash
cd /Users/signaturesb/Documents/github/Claude,\ code\ Telegram/
npm install playwright
npx playwright install chromium --with-deps
```

### Étape 2 — Require en haut de bot.js (après les autres requires)
```javascript
const cuaDriver = (() => {
  try { return require('./cua_driver'); }
  catch (e) { console.warn('[CUA] Non disponible:', e.message); return null; }
})();
```

### Étape 3 — Modifier telechargerFicheCentris() dans bot.js
Chercher la fonction `telechargerFicheCentris` (ou `_envoyerListingPubliqueLink`).
Insérer AVANT le fallback lien public:

```javascript
// Stratégie 3: CUA Playwright + Claude Computer Use
if (cuaDriver?.CUA_AVAILABLE()) {
  try {
    log('[Centris] Tentative CUA...');
    const cuaResult = await cuaDriver.cuaGetCentrisPDF(centrisNum);
    if (cuaResult.success && cuaResult.buffer) {
      log('[Centris] CUA succès ✅ PDF réel obtenu');
      return await _envoyerPDFBuffer({
        buffer: cuaResult.buffer,
        filename: cuaResult.filename || `Centris_${centrisNum}.pdf`,
        email: emailDest,
        centrisNum,
        messagePers: messagePerso
      });
    }
    log('[Centris] CUA: ' + cuaResult.message + ' → fallback lien public');
  } catch (e) {
    log('[Centris] CUA erreur: ' + e.message + ' → fallback');
  }
}
```

### Étape 4 — Modifier telechargerAnnexesCentris() dans bot.js
Même pattern que fiche principale mais utiliser `cuaDriver.cuaGetCentrisAnnexes(centrisNum, filtre)`.

### Étape 5 — Ajouter cuaStatus() au endpoint /health
```javascript
// Dans l'objet health retourné:
cua: cuaDriver ? cuaDriver.cuaStatus() : { available: false },
```

### Étape 6 — Cron cleanup hebdo (optionnel)
```javascript
// Dans les crons existants, ajouter:
cron.schedule('0 3 * * 0', () => {  // dimanche 3h
  if (cuaDriver) {
    const n = cuaDriver.cuaCleanup();
    if (n > 0) log(`[CUA] Cleanup: ${n} fichiers supprimés`);
  }
});
```

### Test live après intégration
```
Telegram: "Envoie la fiche #22264330 à shawn@signaturesb.com"
→ doit recevoir PDF réel (pas lien)
```

---

## À IMPLÉMENTER (prochaines sessions)

- [x] CUA driver Centris PDF (cua_driver.js) ← FAIT
- [ ] Intégrer CUA dans bot.js (telechargerFicheCentris + annexes) ← NEXT
- [ ] npm install playwright + install chromium sur Render
- [ ] `chercher_comparables` — scraping Centris sold
- [ ] `comparer_marche` — DuProprio + argument commercial
- [ ] `registre_foncier` — SIRF + Infolot + APCIQ
- [ ] Couverture géo 60+ muns (Lanaudière + Montréal + Laval)
- [ ] Make.com: pointer webhooks Centris/reply → signaturesb-bot-s272.onrender.com
- [ ] Réactiver J+1/J+3/J+7 quand Shawn est prêt

---

## VISION SAAS

Louer à courtiers (~150-300$/mois) ou vendre à grande compagnie.  
`AGENT_CONFIG` complet: zero valeur hardcodée, tout en env vars.
