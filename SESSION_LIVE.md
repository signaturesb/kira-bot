# SESSION LIVE — 2026-04-24 (mis à jour)

## 🔧 2026-04-24 — Optimisation flux lead automatique Centris

**Demande Shawn:** Automatisation parfaite Centris → docs prospect, Bcc invisible, jamais planter.

**Décision:** Option B — Shawn en Bcc invisible sur tous les envois auto.

### Ce qui a été fait aujourd'hui:

**1. lead_parser.js — REÉCRIT + RENFORCÉ ✅**
- `isValidProspectName()` — rejette noms d'agent (Shawn Barrette, RE/MAX, etc.), mots génériques
- `isValidEmail()` — rejette emails internes (signaturesb, remax, centris, noreply...)
- `isValidPhone()` — valide format 10 chiffres NA strict
- Score qualité parsing `_score` (0-100): nom+email+tel+centris
- AI Haiku activé automatiquement si score < 70
- Merge AI amélioré: regex prioritaire, AI comble les vides uniquement
- Validation finale: AI ne peut pas non plus retourner le nom du courtier

**2. PATCH_LEAD_FLOW.md — CRÉÉ ✅**
- Documente tous les changements à appliquer dans bot.js
- Pseudo-code prêt pour Claude Code sur Mac

### Ce qui reste à faire (bot.js — session Claude Code sur Mac):

**Priorité 1 — Bcc:**
- Rechercher `cc: SHAWN_EMAIL` ou `Cc:` dans les fonctions d'envoi email
- Remplacer par `Bcc:` (Gmail API headers)

**Priorité 2 — Retry envoi docs:**
- Wrapper `envoyerDocsAutoResilient()` avec 3 tentatives (0s, 30s, 2min)
- Si échec définitif → alerte Telegram immédiate

**Priorité 3 — Validation nom avant deal:**
- Dans `traiterNouveauLead()`: si nom invalide → stocker en pending + alerter Shawn
- NE PAS créer deal avec nom "Shawn Barrette" ou vide

**Priorité 4 — Alerte si docs non envoyés:**
- `alertShawnDocsFailed()` avec nom, email, adresse, centris + instruction manuelle

---

## 🔄 2026-04-22 PM — Roadmap du bot Telegram réconciliée avec l'état réel

**Contexte:** Le bot Telegram a poussé sur `origin` (kira-bot) 3 docs utiles + une vieille version de `bot.js` (force push destructif basé sur `2b815d27`). Heureusement `bot-assistant/main` (= remote Render prod) était resté à jour à `c8b899d` — aucune interruption prod.

**Action prise:**
1. Récupéré les 3 docs utiles dans le working tree sans écraser le local:
   - `INSTRUCTIONS_CLAUDE_CODE.md` — méta-instructions pour les sessions
   - `ROADMAP_OPTIMISATION.md` — plan 6 phases
   - `ANTI_DOUBLONS.md` — protocole Pipedrive/Gmail/Brevo
2. Vérifié que Phase 1 complète de la roadmap était déjà implémentée (le bot Telegram n'avait pas cette info)
3. Remis `origin` (kira-bot) d'aplomb avec la version complète du code — les commits auto `Activity/Sync/Boot` de la journée sont perdus (régénérés par runtime)

**État Phase 1 roadmap vs code réel:**
- 1.1 Polling crash → N/A (bot en **webhook** depuis `2afdc0f`, plus robuste)
- 1.2 `/health` détaillé → ✅ ligne 4037 (subsystems + metrics + circuits + poller)
- 1.3 CRASH_REPORT global → ✅ ligne 120-132 (uncaught + unhandled → GitHub)

**État Phase 2-3 roadmap vs code réel:**
- 2.1 Réveil matinal 7h → ✅ `rappelVisitesMatin()` ligne 3748
- 2.2 Alerte leads chauds → ✅ Gmail Poller (scan 5min Centris/RE-MAX → deal + J+0)
- 2.3 Détection deals refroidissants → ⚠️ À implémenter
- 2.4 **Anti-doublons renforcé** → ⚠️ À implémenter — protocole dans `ANTI_DOUBLONS.md`
- 3.1 Token refresh auto → ✅ Dropbox 3h + Gmail null-safe + refresh on boot
- 3.2 Retry/timeout → ⚠️ Partiel (à renforcer)
- 3.3 Circuit breaker → ✅ `circuits{}` ligne 161 + ouvertures visibles `/health`

**Règle de sécurité git:** `bot-assistant/main` (Render) = vérité production. Ne jamais force-push dessus. `origin/main` (kira-bot) = dev, peut être resynché quand le bot diverge.

---

## 🎯 RÉSOLU: startCommand Render pointait vers `index.js` inexistant!

**Cause racine de TOUS les deploy fails depuis c209c9e:**
Service Render (via UI) configuré avec `startCommand: node index.js`
Mais notre fichier est `bot.js` (package.json main: bot.js)
→ Node exit 1 immédiat, AUCUN code bot.js jamais exécuté.

**Fix (commit 6a2fccb + 39e6561) — LIVE ✅:**
- `PATCH /v1/services/{id}` → `startCommand: node bot.js`
- bot.js restauré (4048 lignes, 39 outils, webhook Telegram)
