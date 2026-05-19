# SESSION_LIVE — Travail Claude Code en temps réel

> Synchronisé via git push vers `kira-bot` repo. Bot Telegram lit ce fichier toutes les 30 min via `loadSessionLiveContext()` (bot.js:10603).
> Dernière maj: **2026-05-14 05:35 UTC** — Centris fallback lien public

---

## 🎯 Session 2026-05-13/14 — État actuel

### ✅ DÉPLOYÉS (Render bot-assistant main):
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

### ✅ INFRASTRUCTURE Mac autonome:
- `com.signaturesb.centris-auto-login` LaunchAgent — toutes 12h + boot
- `com.signaturesb.sms-bridge` LaunchAgent — chat.db poll + clipboard
- Full Disk Access activé pour `/usr/local/bin/node`
- **28 LaunchAgents signaturesb totaux**

### ✅ FIX 05:35 UTC — `f43d845` Centris fallback lien public
**Solution pragmatique:** Si PDF Matrix inaccessible, envoie email pro Signature SB avec **lien Centris.ca public** + photos + détails + Cc Shawn auto.

Flow multi-stratégies dans `telechargerFicheCentris`:
0. **Pré-check** listing existe sur Centris.ca public → si 404, message clair "MLS invalide"
1-2. Try URLs Matrix legacy (peut encore marcher pour certains)
3. **Fallback** `_envoyerListingPubliqueLink` — email HTML stylé avec bouton CTA vers fiche publique

**Test possible:** `Envoie #22264330 à client@email.com` → reçoit email pro avec lien fiche complète Centris.ca + photos.

### 🟡 BUG RÉSIDUEL — PDF officiel Matrix (annexes DV, certificat)
**Description:** `telechargerFicheCentris` utilise `CENTRIS_BASE = 'https://www.centris.ca'` avec URLs `/MX/PrintSheet/{num}` qui sont d'un ancien portail agent.centris.ca retiré.

**Tests faits dans cette session:**
- ❌ `/Matrix/Public/Portal.aspx?L=1&K=1&p=DE-1-1-XXX` → erreurs
- ❌ `/Matrix/Listing/XXX`, `/Matrix/Property/XXX` → 404
- ❌ `/Matrix/Public/Print/XXX` → 404
- ❌ `https://media.centris.ca/property/XXX/sheet.pdf` → 0 bytes

**Centris a probablement migré les URLs PDF en 2026**. Next iter: explorer Matrix UI manuellement (Playwright) pour trouver le bouton "Print PDF" et capturer son URL réelle via network requests.

### ⚠️ Centris session stability
Les cookies Matrix expirent ou sont invalidés quand:
- Login trop rapide successif
- Plusieurs sessions parallèles
- Activity sur autre device

Le `centris-auto-login` LaunchAgent refresh toutes les 12h mais sessions peuvent être invalidées entre temps.

### ✅ Ce qui MARCHE pour Shawn aujourd'hui

**Pour SES listings (dans Dropbox `/Terrain en ligne/` ou `/Inscription/`):**
- `Envoie tout sur #22264330 à client@email.com` → docs Dropbox + Cc shawn@ auto
- Idem #10102238, #19070453, #25244988, etc.

**Autres outils 100% fonctionnels:**
- Pipedrive cleanup, deal creation, activité
- Brevo campaigns + veille J-1 + Cc Shawn auto
- Firecrawl zonage municipal (clé fc-5...7d07 active)
- AssemblyAI transcription (5h/mois gratuit)
- Gmail email + scraping leads

### 🔬 TODO immédiat next session
1. **Fix Centris URLs Matrix 2026** — capture flow via Playwright network panel
2. **Investiguer pourquoi Centris invalide sessions rapides** — peut-être inserer délai 30s entre login attempts
3. **Test live avec un listing actif** — confirmer que le fix marche

### 📊 Health check actuel
```
✅ pipedrive, brevo, dropbox, anthropic, transcribe (assemblyai)
0 fails — score 100/100
```

---

## 📂 Pour ChatGPT/agents externes qui suivent
- Repo principal: `github.com/signaturesb/kira-bot`
- Bot status: `github.com/signaturesb/bot-assistant/raw/main/BOT_STATUS.md`
- Health live: `https://signaturesb-bot-s272.onrender.com/admin/health`
- SESSION_LIVE.md ← ce fichier (kira-bot raw)

---

## 🆕 Session 2026-05-19 (mini, suite après 5j)

### Health ✅ tout vert (5j sans intervention)
- pipedrive, brevo, dropbox, anthropic, transcribe: 0 fails
- 28 LaunchAgents Mac actifs (sms-bridge, centris-auto-login, scheduler)

### Plaintes Shawn analysées (chat-history bot)
1. **CC FORCÉ** (100x demandé) → ✅ FIX commit 524581a
2. Master template logos parfois oublié → 📝 mémoire `feedback_email_template_logos`
3. Site terrain-a-construire dans emails → 📝 mémoire `feedback_email_no_terrain_a_construire`
4. Preview avant envoi client → 📝 mémoire `feedback_email_trace_telegram`
5. "Toujours savoir ce qu'on envoie" → ✅ Notif Telegram chaque envoi
6. Optimisation pro → en cours

### Fix déployé (commit 524581a)
**`sendEmailLogged()`** notifie Telegram à chaque envoi vers client ≠ Shawn:
```
📧 Email envoyé
Cat: <category>
À: <to>
Cc: <list>
Sujet: <subject>
[⚠️ Tu n'étais PAS en Cc si applicable]
```

### Découvert: commit ea26c44 (Claude Code precedent session)
**CUA driver complet — Centris Matrix PDF via Claude Computer Use API**
→ Solution Centris PDF via Computer Use. À tester quand session Centris valide.

### Mémoires créées
- feedback_email_trace_telegram (Cc/notif règle)
- feedback_email_template_logos (master_template Signature SB obligatoire)
- feedback_email_no_terrain_a_construire (filter site)

### Pricing Claude (info Shawn)
Plan actuel conservé. Pour référence: Claude Max 20x à 200$/mois recommandé pour usage intense sessions multi-heures.
