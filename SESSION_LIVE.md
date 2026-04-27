# SESSION LIVE — 2026-04-27 (mis à jour — CLAUDE CODE EN COURS)

## 🎯 MISSION PRIORITAIRE — SYSTÈME DE PROTECTION COMPLET

**Demande Shawn:** "Prévenir plutôt que guérir — système de protection qui règle tout avant que ça arrive."

**Fichier à lire EN PREMIER:** `PROTECTION_SYSTEM.md` (déjà dans le repo)

---

## 🆕 NOUVELLE PRIORITÉ — OUTIL SUPPRESSION ACTIVITÉS (ajouter en ÉTAPE 0)

**Demande Shawn (27 avril 2026):** Supprimer les doublons d'activités automatiquement — garder 1 seule activité par contact/deal.

### ÉTAPE 0 — Outil `supprimer_activite` + dédup automatique (20 min)

**Problème:** Quand le bot crée plusieurs activités J+1 pour le même prospect, il y a des doublons (ex: Lounes 20 activités, Jeannot 20 activités).

**Solution à implémenter:**

1. **Ajouter outil MCP `supprimer_activite`** dans bot.js:
```javascript
{
  name: "supprimer_activite",
  description: "Supprimer une ou toutes les activités en double d'un deal Pipedrive. Garder seulement la plus récente.",
  parameters: {
    terme: { type: "string", description: "Nom du prospect" },
    garder: { type: "string", description: "ID activité à garder (optionnel — sinon garde la plus récente)" }
  }
}
// API: DELETE /v1/activities/{id}
```

2. **Ajouter fonction `dedupActivites(dealId)`** dans bot.js:
```javascript
async function dedupActivites(dealId) {
  // GET /v1/deals/{id}/activities
  // Grouper par type
  // Garder la plus récente de chaque type
  // DELETE toutes les autres
}
```

3. **Appeler `dedupActivites()` AVANT `creerActivite()`** dans `traiterNouveauLead()`:
```javascript
// Vérifier si activité du même type existe déjà → skip si oui
```

4. **Règle absolue:** 1 seule activité "appel" par deal à la fois.

---

## 🛡️ CE QUE TU DOIS IMPLÉMENTER (dans l'ordre)

### ÉTAPE 1 — N1: Alerte J+1 automatique (20 min)
- Ajouter fonction `planifierAlerteJ1()` dans `bot.js`
- Appeler dans `traiterNouveauLead()` APRÈS création deal Pipedrive
- Créer `pending_alerts.json` dans `/data/`
- Tout le code est dans `PROTECTION_SYSTEM.md` → section N1

### ÉTAPE 2 — N2: Rapport matin 8h30 (15 min)
- Ajouter `schedule.scheduleJob('30 8 * * *', ...)` dans le bloc crons existants
- Ajouter fonction `envoyerRapportMatin()`
- Tout le code est dans `PROTECTION_SYSTEM.md` → section N2

### ÉTAPE 3 — N3: Cron horaire seuils stagnation (20 min)
- Ajouter `schedule.scheduleJob('0 * * * *', ...)` dans le bloc crons
- Ajouter fonctions `checkAlertes()` + `checkSeuils()`
- Tout le code est dans `PROTECTION_SYSTEM.md` → section N3

### ÉTAPE 4 — N4: Hygiene CRM quotidienne 9h (15 min)
- Ajouter `schedule.scheduleJob('0 9 * * *', ...)` dans le bloc crons
- Ajouter fonction `hygieneQuotidienne()`
- Tout le code est dans `PROTECTION_SYSTEM.md` → section N4

### ÉTAPE 5 — N5: Digest hebdo dimanche 20h (10 min)
- Ajouter `schedule.scheduleJob('0 20 * * 0', ...)` dans le bloc crons
- Ajouter fonction `envoyerDigestHebdo()`
- Tout le code est dans `PROTECTION_SYSTEM.md` → section N5

### ÉTAPE 6 — Patches précédents (si pas encore faits)
Lire `LEAD_FLOW_FINAL.md` → P3 (Bcc), P2 (Retry docs), P1 (Validation nom), P4 (/pending amélioré)

---

## ✅ APRÈS CHAQUE ÉTAPE

```bash
node validate.js   # doit passer sans erreur
git add -A && git commit -m "[PROTECTION N1] Alerte J+1 automatique"
git push origin main
# Attendre 90 secondes
curl https://signaturesb-bot-s272.onrender.com/health
# Vérifier: tools count OK + pas d'erreurs
```

---

## 📁 FICHIERS CLÉS À LIRE EN PREMIER

1. `PROTECTION_SYSTEM.md` — ⭐ MISSION DU JOUR — code complet N1→N5
2. `LEAD_FLOW_FINAL.md` — 4 patches bot.js (P1→P4) si pas encore faits
3. `LEÇONS.md` — pièges connus (Render, Git, Opus)
4. `ÉTAT_SYSTÈME.md` — architecture complète du bot
5. `FIRECRAWL_PROMPT_CLAUDE_CODE.md` — intégration Firecrawl (après protection system)

---

## 🔧 VARIABLES D'ENVIRONNEMENT (Render — déjà configurées)

- `PIPEDRIVE_API_KEY` ✅
- `TELEGRAM_BOT_TOKEN` ✅
- `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN` ✅
- `DROPBOX_APP_KEY` + `DROPBOX_APP_SECRET` + `DROPBOX_REFRESH_TOKEN` ✅
- `FIRECRAWL_API_KEY=fc-52e378f6759746e4807406ddc3517d07` ← ajouter si pas encore fait
- `FIRECRAWL_QUOTA_MONTHLY=500` ← ajouter si pas encore fait

---

## 🏗️ ARCHITECTURE BOT

- URL: `https://signaturesb-bot-s272.onrender.com`
- Health check: `/health`
- Data dir: `/data/` (Render persistent disk)
- Fichiers data: `pending_alerts.json`, `pending_leads.json`, `dedup_leads.json`
- Telegram allowed ID: dans env vars `ALLOWED_ID`

---

## 📌 CONTEXTE BUSINESS

- Shawn Barrette | Courtier RE/MAX PRESTIGE | shawn@signaturesb.com | 514-927-1340
- 98 prospects sans contact depuis 3j+ → SYSTÈME DE PROTECTION OBLIGATOIRE
- Leads stagnants jusqu'à 450j → seuils automatiques requis
- Taux conversion 10% → objectif remonter à 30%+ avec ce système
- Philosophie: PRÉVENIR avant que ça arrive, jamais réactif

---

## ⚠️ RÈGLES IMPORTANTES

1. Ne JAMAIS deviner l'année — date courante: 2026-04-27
2. Toujours `node validate.js` avant push
3. Attendre 90s après push pour que Render redémarre
4. Vérifier `/health` après chaque déploiement
5. Si erreur Render → vérifier logs Render dashboard
6. DATA_DIR = détecter auto (`/data/` si existe, sinon `./data/`)
7. **RÈGLE ACTIVITÉS:** 1 seule activité par type par deal — vérifier AVANT de créer
8. **RÈGLE ACTIVITÉS:** Toujours créer sur le deal du prospect, jamais sur un deal séparé

---

*Sync: Kira bot Telegram ↔ Claude Code — 2026-04-27 17:56*
