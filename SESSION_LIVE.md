# SESSION_LIVE — Travail Claude Code en temps réel

> Synchronisé via git push vers `kira-bot` repo. Bot Telegram lit ce fichier toutes les 30 min.
> Dernière maj: **2026-05-16** — cua_driver v2 livré par bot Telegram

---

## 🎯 ÉTAT ACTUEL — cua_driver v2

### ✅ LIVRÉ PAR BOT TELEGRAM (2026-05-16):

**`cua_driver.js` v2 — réécrit complet:**
- Architecture multi-stratégie: session cache → navigation directe URLs → CUA Claude pilote → screenshot fallback
- Login Centris Auth0 split-form avec MFA SMS polling `/data/centris_mfa.txt`
- Session cookies persistée 12h dans `/data/cua_session.json`
- Intercepteur réseau PDF (capture `content-type: application/pdf` sur tout le context)
- Boucle CUA avec `claude-haiku-4-5` (rapide + économique vs Opus)
- Fallback gracieux si Playwright absent: `CUA_AVAILABLE()` → false sans crash
- `cuaGetCentrisPDF(num)` → Buffer PDF | Buffer PNG (screenshot) | null
- `cuaGetCentrisAnnexes(num, filtre)` → [{ name, buffer }]
- `cuaDownloadAndEmail({...})` → interface haut niveau pour bot.js
- `diagnoseCUA()` → diagnostic complet: deps → env vars → browser launch → login → screenshot

**`test_cua_driver.js` — suite tests complète:**
- Unit tests: exports, session mgmt, TTL expiry, fallback sans Playwright
- Integration: `--login` teste login Centris réel
- Full: `--full` télécharge PDF #22264330 et valide le buffer
- Diagnostic: `--diag` lance `diagnoseCUA()`

**`package.json` mis à jour:**
- `playwright` dans `optionalDependencies` (pas requis sur Render si pas de browser)
- Scripts: `test-cua`, `test-cua:login`, `test-cua:full`, `test-cua:diag`, `install-playwright`

---

## 🔴 ACTION REQUISE — Claude Code (toi, sur le Mac)

### ÉTAPE 1 — Installer Playwright sur le Mac (si pas déjà fait)
```bash
cd /Users/signaturesb/Documents/github/Claude,\ code\ Telegram/
npm install playwright
npx playwright install chromium --with-deps
```

### ÉTAPE 2 — Copier cua_driver.js + test dans le repo local bot-assistant
```bash
# Puller les derniers fichiers depuis kira-bot
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://raw.githubusercontent.com/signaturesb/kira-bot/main/cua_driver.js \
  -o cua_driver.js

curl -H "Authorization: token $GITHUB_TOKEN" \
  https://raw.githubusercontent.com/signaturesb/kira-bot/main/test_cua_driver.js \
  -o test_cua_driver.js
```

### ÉTAPE 3 — Tests unitaires (rapide, sans browser)
```bash
node test_cua_driver.js
# Attendu: tous ✅, 0 ❌
```

### ÉTAPE 4 — Test diagnostic + login
```bash
node test_cua_driver.js --diag
# Vérifie: deps, env vars, browser launch, login Centris, screenshot
```

### ÉTAPE 5 — Test complet PDF (listing réel)
```bash
node test_cua_driver.js --full
# Télécharge PDF #22264330, valide buffer, sauvegarde test_output_22264330.pdf
```

### ÉTAPE 6 — Intégrer dans bot.js (si tests passent)

Dans `bot.js`, remplacer la fonction `telechargerFicheCentris` existante par:

```javascript
// Au top du fichier, après les requires:
const { cuaGetCentrisPDF, cuaGetCentrisAnnexes, CUA_AVAILABLE, diagnoseCUA } = (() => {
  try { return require('./cua_driver'); }
  catch { return { CUA_AVAILABLE: () => false, cuaGetCentrisPDF: async () => null, cuaGetCentrisAnnexes: async () => [], diagnoseCUA: async () => ({ ok: false, steps: [], error: 'cua_driver absent' }) }; }
})();

// Dans telechargerFicheCentris() — remplacer le corps:
async function telechargerFicheCentris(centrisNum, emailDestination, messagePerso, cc) {
  const num = String(centrisNum).replace(/\D/g, '');

  // Stratégie 1: CUA si disponible
  if (CUA_AVAILABLE()) {
    log('INFO', 'CUA', `Téléchargement PDF ${num} via CUA...`);
    const pdfBuffer = await cuaGetCentrisPDF(num);
    if (pdfBuffer) {
      // Envoyer l'email avec le PDF en PJ
      return await envoyerEmailAvecPDF({
        to: emailDestination,
        subject: `Fiche Centris #${num}`,
        body: messagePerso || `Bonjour,\n\nVeuillez trouver ci-joint la fiche officielle pour la propriété Centris #${num}.\n\nAu plaisir,\nShawn Barrette`,
        attachments: [{ name: `fiche_${num}.pdf`, buffer: pdfBuffer }],
        cc,
      });
    }
  }

  // Stratégie 2: fallback lien public
  const publicUrl = `https://www.centris.ca/fr/propriete~${num}`;
  return await envoyerEmailAvecLienPublic({ emailDestination, centrisNum: num, publicUrl, messagePerso, cc });
}
```

### ÉTAPE 7 — Commit + push + deploy
```bash
node --check bot.js  # validation syntaxe
git add cua_driver.js test_cua_driver.js package.json bot.js
git commit -m "feat: intégration cua_driver v2 dans bot.js — PDF Centris via Computer Use"
git push
```

---

## 📋 RÉSUMÉ PROBLÈME RÉSOLU

**Problème:** `telechargerFicheCentris()` utilisait des URLs Matrix obsolètes → 0 bytes / 404.

**Solution:** Computer Use Agent — Claude pilote Chromium headless, navigue Matrix comme un humain, intercepte le PDF via le réseau.

**Résultat attendu:** `Envoie la fiche #22264330 à client@email.com` → email reçu avec vrai PDF officiel Centris en pièce jointe.

---

## ✅ DÉPLOYÉS PRÉCÉDEMMENT (Render bot-assistant main):
- `cf83ccf` health check AssemblyAI primaire + OpenAI fallback
- `5590e87` backup Dropbox auto-refresh + fallback disk
- `38b8d0c` veille J-1 sur Render 24/7 + boutons inline
- `f4e40ae` Cc Shawn auto sur tous sendNow Brevo
- `ef021d8` Pipedrive cleanup catégorie (D) Shawn-as-contact
- `cf5ee04` BLOC A6+A7+B + analyser_zonage_adresse (4 features)
- `2e66aa5` Dropbox uploadDropboxSecret auto-refresh 401
- `7d4380a` centrisLogin() utilise OAuth Auth0 + MFA SMS
- `59a887a` AssemblyAI primaire + Whisper fallback transcription
- `04f92e1` centris-oauth Auth0 new flow identifier/password split + debug
- `1e4461b` /admin/centris-mfa-code endpoint (Gmail OAuth)
- `4e558e7` /admin/centris-fetch debug endpoint
- `f43d845` Centris fallback lien public (fix temporaire — remplacé par cua_driver v2)
