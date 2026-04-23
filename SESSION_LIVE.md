# SESSION LIVE — 2026-04-24 (mis à jour — PRÊT POUR CLAUDE CODE)

## 🎯 MISSION DU JOUR — FLUX LEAD AUTO PARFAIT

**Demande Shawn:** "Le meilleur système, le plus perfectionné, efficace, que ça fonctionne une bonne fois pour toute."

**État lead_parser.js:** ✅ COMPLET (patch 24 avril — validation anti-faux-positifs)

**État bot.js:** ⚠️ 4 patches restants → voir `LEAD_FLOW_FINAL.md`

---

## 🔧 CE QUI RESTE À FAIRE — SESSION CLAUDE CODE

### Lire d'abord:
1. `LEAD_FLOW_FINAL.md` — instructions précises avec code prêt à copier
2. `LEÇONS.md` — pièges connus (Render, Git, Opus)
3. `ÉTAT_SYSTÈME.md` — architecture complète

### Les 4 patches dans bot.js (dans cet ordre):

**P3 — Bcc (2 min):**
- Chercher: `Cc: ${SHAWN_EMAIL}` ou `cc: SHAWN_EMAIL`
- Remplacer par: `Bcc:` dans MIME / `bcc:` dans payload Gmail API
- Validation: envoyer email test, Shawn ne doit PAS apparaître en Cc

**P2 — Retry docs résilient (10 min):**
- Ajouter `alertShawnDocsFailed()` + `envoyerDocsAutoResilient()` AVANT la définition de `envoyerDocsAuto()`
- Faire find+replace: `envoyerDocsAuto(` → `envoyerDocsAutoResilient(` (sauf la définition)
- Le code complet est dans `LEAD_FLOW_FINAL.md` → section P2

**P1 — Validation nom avant deal (15 min):**
- Dans `traiterNouveauLead()`, AVANT `creerDeal()` ou `tools.creer_deal()`
- Ajouter le bloc de validation + pending + alerte Telegram
- Le code complet est dans `LEAD_FLOW_FINAL.md` → section P1

**P4 — /pending amélioré (10 min):**
- Charger `pending_leads.json` au boot
- Ajouter handler `nom [Prénom Nom]` dans les commandes
- Le code complet est dans `LEAD_FLOW_FINAL.md` → section P4

### Après chaque patch:
```bash
node validate.js  # doit passer
git add -A && git commit -m "[PATCH Px] Description"
git push origin main
# Attendre 90s
curl https://signaturesb-bot-s272.onrender.com/health
# Vérifier tools count + pas d'erreurs
```

---

## ✅ DÉJÀ COMPLÉTÉ (lead_parser.js — 2026-04-24)

- `isValidProspectName()` — rejette Shawn Barrette, remax, courtier, etc.
- `isValidEmail()` — rejette signaturesb, remax, centris, noreply
- `isValidPhone()` — valide 10 chiffres NA strict
- Score qualité `_score` (0-100)
- AI Haiku activé si score < 70
- Merge AI amélioré (regex prioritaire, AI comble seulement)

---

## 📊 CONTEXTE LEADS RÉCENTS

| Date | Prospect | Propriété | Problème | Statut |
|------|----------|-----------|----------|--------|
| 23 avril ~0h15 | ❌ "Shawn Barrette" (mauvais) | 2850 Rue Stella, Rawdon #11041781 | Parser bugué | Docs jamais envoyés |
| 23 avril ~4h43 | Erika Sciortino | Rang St-Joseph, St-Ignace-de-Loyola #26621771 | Deal x2 | Vérifier doublons |
| 23 avril ~5h05 | Erika Sciortino | Rang St-Joseph, St-Ignace-de-Loyola #26621771 | Lead x2 | Vérifier doublons |

**Lead Rue Stella — À RÉGLER MANUELLEMENT:**
- Chercher deal "Shawn Barrette" dans Pipedrive → marquer perdu ou supprimer
- Identifier le vrai prospect via email Centris original
- Envoyer les 5 PDFs Dropbox manuellement (`envoie les docs à [email]`)

---

## 🏗️ ARCHITECTURE FLUX LEAD (cible après patches)

```
Email Centris arrive dans Gmail
         ↓
Gmail Poller scan (toutes 5min)
         ↓
isJunkLeadEmail() → si junk: SKIP
         ↓
parseLeadEmail() → score qualité 0-100
         ↓ si score < 70
         → parseLeadEmailWithAI() (Haiku)
         ↓
isValidProspectName()?
   NON → pending_leads.json + alerte Telegram "⚠️ nom non identifié"
         Shawn répond "nom [Prénom Nom]" → deal créé
   OUI ↓
creerDeal(Pipedrive) — dédup par email/tel/nom
         ↓
matchDropboxAvance(centris/adresse) — 4 stratégies
         ↓ si match ≥ 90%
envoyerDocsAutoResilient() — 3 tentatives (0s/30s/2min)
   SUCCÈS → note Pipedrive + alerte Telegram ✅
   ÉCHEC  → alertShawnDocsFailed() "🚨 DOCS NON ENVOYÉS"
         ↓ si match 80-89%
brouillon Telegram — Shawn dit "envoie"
         ↓ si match < 80%
alerte manuelle Shawn (aucun docs envoyés)
```

---

## 🔑 POINTS DE DÉFAILLANCE RÉSOLUS

| Bug | Cause | Fix |
|-----|-------|-----|
| Deal "Shawn Barrette" | Parser capturait nom d'agent dans HTML Centris | P1: validation + pending |
| Docs jamais envoyés | Un seul échec = silencieux | P2: retry 3x + alerte |
| Shawn visible en Cc | cc: visible dans email client | P3: Bcc invisible |
| Leads incomplets perdus | Pas de pending persistant | P4: JSON sur disque |

---

## 📋 CHECKLIST FINALE (après tous les patches)

- [ ] P3 Bcc — test envoi email, Shawn invisible
- [ ] P2 Retry — tester avec `envoyerDocsAuto()` qui throw intentionnellement
- [ ] P1 Validation — tester avec email Centris qui a nom = "Shawn Barrette"
- [ ] P4 Pending — tester commande "nom Jean Tremblay" après lead pending
- [ ] /health — 40+ tools, 0 erreurs
- [ ] /checkemail — scan 48h sans crash
- [ ] Lead réel test — confirmer parsing correct + docs envoyés + Shawn en Bcc
