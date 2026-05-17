# SESSION_LIVE — Travail Claude Code en temps réel

> Synchronisé via git push vers `kira-bot` repo. Bot Telegram lit ce fichier toutes les 30 min via `loadSessionLiveContext()`.
> Dernière maj: **2026-05-16 20:10 UTC** — CUA driver livré

---

## 🎯 Session 2026-05-16 — CUA DRIVER LIVRÉ

### ✅ LIVRÉ — `cua_driver.js` (Computer Use Agent)

**Résout définitivement:** Bug PDF Matrix Centris — URLs 2026 inaccessibles via scraping.

**Ce que fait le driver:**
- Playwright Chromium headless + Claude Computer Use API (`computer-use-2024-10-22`)
- Boucle: screenshot → Claude voit l'écran → décide action (click/type/scroll) → exécute → repeat
- Login Centris automatique (Auth0 + MFA SMS bridge)
- Cache session cookies 12h → `/data/cua_session.json`
- Cache PDF 24h → `/data/cua_pdfs/`
- Max 25 steps par tâche, fallback gracieux si Playwright absent
- Cleanup auto screenshots + PDFs > 7j

**API:**
```javascript
const { cuaGetCentrisPDF, cuaGetCentrisAnnexes, cuaNavigate, cuaStatus } = require('./cua_driver');
const r = await cuaGetCentrisPDF('22264330');   // → { success, buffer, filename }
const a = await cuaGetCentrisAnnexes('22264330', 'DV'); // → { success, annexes[] }
```

**Fallback chain après intégration:**
```
1. URLs Matrix legacy (peut encore marcher)
2. CUA: Playwright + Claude voit l'écran → PDF réel ← NOUVEAU
3. Email lien public Centris (déjà en place)
```

---

## 🔴 NEXT — Intégration dans bot.js (Claude Code Mac)

**Une session, ~45 min, 6 étapes:**

### Étape 1 — Installer Playwright
```bash
cd /Users/signaturesb/Documents/github/Claude,\ code\ Telegram/
npm install playwright
npx playwright install chromium --with-deps
# Vérifier: node -e "require('playwright'); console.log('OK')"
```

### Étape 2 — Require lazy en haut de bot.js
```javascript
// Après les autres requires (~ligne 30):
const cuaDriver = (() => {
  try { return require('./cua_driver'); }
  catch (e) { console.warn('[CUA] Non disponible:', e.message); return null; }
})();
```

### Étape 3 — Modifier telechargerFicheCentris()
Chercher `_envoyerListingPubliqueLink` ou le bloc "Stratégie 3" dans bot.js.
**Insérer AVANT le fallback lien public:**
```javascript
// Stratégie CUA — PDF réel via Computer Use
if (cuaDriver?.CUA_AVAILABLE()) {
  try {
    const cuaResult = await cuaDriver.cuaGetCentrisPDF(centrisNum);
    if (cuaResult.success && cuaResult.buffer) {
      return await _envoyerPDFBuffer({
        buffer: cuaResult.buffer,
        filename: cuaResult.filename,
        email: emailDest,
        centrisNum,
        messagePers: messagePerso
      });
    }
  } catch (e) { /* fallback lien public */ }
}
```

### Étape 4 — Modifier telechargerAnnexesCentris()
Même pattern: `cuaDriver.cuaGetCentrisAnnexes(centrisNum, filtre)`

### Étape 5 — Ajouter au /health
```javascript
cua: cuaDriver ? cuaDriver.cuaStatus() : { available: false },
```

### Étape 6 — Test live
```
Telegram: "Envoie la fiche #22264330 à shawn@signaturesb.com"
Expected: email reçu avec PDF réel (pas lien public)
```

---

## ✅ HISTORIQUE DÉPLOYÉS (bot-assistant main)

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
- `f43d845` Centris fallback lien public (email pro stylé)

## ✅ INFRASTRUCTURE Mac autonome
- `com.signaturesb.centris-auto-login` LaunchAgent — toutes 12h + boot
- `com.signaturesb.sms-bridge` LaunchAgent — chat.db poll + clipboard → `/data/centris_mfa.txt`
- Full Disk Access activé pour `/usr/local/bin/node`
- **28 LaunchAgents signaturesb totaux**

---

## ✅ Ce qui MARCHE pour Shawn aujourd'hui

**Pour SES listings (Dropbox `/Terrain en ligne/` ou `/Inscription/`):**
- `Envoie tout sur #22264330 à client@email.com` → docs Dropbox + Cc shawn@ auto

**Autres outils 100% fonctionnels:**
- Pipedrive cleanup, deal creation, activité
- Brevo campaigns + veille J-1 + Cc Shawn auto
- Firecrawl zonage municipal (clé fc-5...7d07 active)
- AssemblyAI transcription (5h/mois gratuit)
- Gmail email + scraping leads

---

## 📊 Health check
```
✅ pipedrive, brevo, dropbox, anthropic, transcribe (assemblyai)
🟡 cua: not yet integrated in bot.js (cua_driver.js prêt)
```

---

## 📂 Pour agents externes
- Repo: `github.com/signaturesb/kira-bot`
- Bot status: `github.com/signaturesb/bot-assistant/raw/main/BOT_STATUS.md`
- Health live: `https://signaturesb-bot-s272.onrender.com/admin/health`
- SESSION_LIVE.md ← ce fichier (kira-bot raw)
