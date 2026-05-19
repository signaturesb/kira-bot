# SESSION_LIVE — Travail Claude Code en temps réel

> Synchronisé via git push vers `kira-bot` repo. Bot Telegram lit ce fichier toutes les 30 min.
> Dernière maj: **2026-05-19** — Fix prioritaire email terrains

---

## 🚨 PRIORITÉ ABSOLUE — 3 FIXES EMAIL TERRAINS

Shawn a répété ces règles des dizaines de fois. Elles doivent être **codées dans bot.js**, pas dans la mémoire du bot qui repart à zéro à chaque session.

---

### FIX 1 — CC AUTOMATIQUE SHAWN (non-négociable)

**Problème:** `shawn@signaturesb.com` n'est pas toujours en Cc sur les emails envoyés aux clients/prospects.

**Règle absolue:** Tout email envoyé par le bot → `shawn@signaturesb.com` en **Cc visible** (pas Bcc).

**Dans bot.js — chercher TOUTES les fonctions d'envoi email:**
- `sendEmailWithTemplate()`
- `envoierEmail()` / `envoyerEmail()`
- `envoierDocsProspect()`
- `envoyerRapportComparables()`
- `sendTerrainsList()`
- **Toute autre fonction qui appelle Gmail API ou Nodemailer**

**Pour chaque fonction, s'assurer que:**
```javascript
// cc doit TOUJOURS inclure shawn@signaturesb.com
const ccFinal = ['shawn@signaturesb.com', ...(cc ? cc.split(',').map(e => e.trim()) : [])];
```

**Tester:** Envoyer un email test à `test@test.com` → vérifier que `shawn@signaturesb.com` reçoit la copie.

---

### FIX 2 — PREVIEW OBLIGATOIRE AVANT TOUT ENVOI

**Problème:** Le bot envoie parfois des emails sans montrer le contenu à Shawn d'abord.

**Règle absolue:** Pour tout email à un prospect/client:
1. Afficher le brouillon complet (destinataire, sujet, corps, Cc)
2. Attendre confirmation: `"envoie"`, `"go"`, `"ok"`, `"parfait"`, `"send"`, `"oui"`
3. **Seulement alors** envoyer

**Exception:** Les emails auto-générés par le lead poller (leads entrants Centris) peuvent être envoyés automatiquement SI le score de match est ≥90.

**Dans bot.js — ajouter flag `requiresConfirmation: true`** sur tous les envois manuels initiés par Shawn via Telegram.

---

### FIX 3 — TEMPLATE EMAIL TERRAINS (Brevo ID 43)

**Problème:** Le bot improvise le template email terrains au lieu d'utiliser le template officiel.

**Règle absolue:** Tout email de liste terrains doit utiliser:
- **Brevo template ID 43** comme base (fond `#0a0a0a`, rouge `#aa0721`, logos RE/MAX + Signature SB base64)
- **JAMAIS** inclure le site `terrainspretsaconstruire.com` dans le contenu
- **Toujours** inclure la promo ProFab (0$ comptant via Desjardins)

**Format liste terrains (dans le template):**
```
Adresse — Centris #XXXXXXXX — Prix — Superficie
```
Groupés par secteur (Rawdon, Sainte-Julienne, Chertsey, etc.)

**Paramètres Brevo template 43:**
```javascript
const params = {
  TITRE_EMAIL: "Terrains disponibles Lanaudière — [Mois Année]",
  HERO_TITRE: "Vos terrains disponibles",
  INTRO_TEXTE: "Bonjour, voici notre sélection de terrains disponibles...",
  TABLEAU_STATS_HTML: "<!-- liste terrains groupés par secteur -->",
  CONTENU_STRATEGIE: "<!-- promo ProFab -->",
  CTA_TITRE: "Prendre rendez-vous",
  CTA_URL: "tel:5149271340",
  CTA_BOUTON: "📞 514-927-1340",
};
```

**Charger le template depuis Brevo API:**
```javascript
const template = await brevo.getSmtpTemplate(43);
// Injecter les params avant envoi
```

---

### FIX 4 — SAUVEGARDER CONTENU EMAIL DANS PIPEDRIVE

**Problème:** Shawn ne peut pas retrouver le contenu exact d'un email envoyé.

**Règle:** Après chaque envoi email à un prospect:
1. Chercher le deal dans Pipedrive (par email ou nom)
2. Ajouter une note avec:
   - Date/heure envoi
   - Destinataire
   - Sujet
   - **Corps complet de l'email**

```javascript
await ajouterNote(dealId, `📧 Email envoyé le ${new Date().toLocaleString('fr-CA')}
À: ${to}
Sujet: ${sujet}
---
${corps}`);
```

---

## ORDRE D'EXÉCUTION

1. **Fix 1 (Cc auto)** — 10 min — critique, faire EN PREMIER
2. **Fix 2 (Preview)** — déjà partiellement en place, vérifier et renforcer
3. **Fix 4 (Note Pipedrive)** — 15 min — important pour traçabilité
4. **Fix 3 (Template Brevo 43)** — 30 min — nécessite test envoi réel

**Après chaque fix:** commit individuel avec message clair + push + vérifier sur Render.

**Test final:** Shawn demande `"envoie liste terrains à test@test.com"` → bot affiche preview → Shawn dit `"envoie"` → email reçu avec bon template + Shawn en Cc + note Pipedrive créée.

---

## 🎯 ÉTAT PRÉCÉDENT — cua_driver v2 (2026-05-16)

> ✅ Livré — voir historique git pour détails. Playwright à installer sur Mac.

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
