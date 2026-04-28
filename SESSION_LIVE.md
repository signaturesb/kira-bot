# SESSION LIVE — 2026-04-28 (mis à jour)

## 🎯 RÈGLE ABSOLUE ACTIVITÉS (priorité #1 — implémenter partout)

**Demande Shawn (28 avril 2026):** Quand une relance n'a pas été faite, NE PAS créer un doublon — mettre à jour l'activité existante avec la nouvelle date.

### LOGIQUE COMPLÈTE:

```
AVANT toute création d'activité → vérifier si activité du même type existe déjà:

SI activité existante trouvée (même type: appel/email/visite):
  → MODIFIER la date (PUT /v1/activities/{id}) = repousser au prochain jour ouvrable
  → NE PAS créer de nouvelle activité
  → Confirmer: "✅ Appel Jean repoussé au [date]"

SI aucune activité existante:
  → CRÉER une nouvelle (POST /v1/activities)
  → Confirmer: "✅ Appel créé pour Jean le [date]"

RÉSULTAT: toujours 1 seule activité active par type par deal
```

### IMPLÉMENTATION DANS bot.js:

**Fonction `upsertActivite(dealId, type, date, heure, sujet)`:**
```javascript
async function upsertActivite(dealId, type, date, heure, sujet) {
  // 1. GET /v1/deals/{dealId}/activities?done=0
  // 2. Chercher activité du même type (appel, email, visite...)
  // 3. Si trouvée → PUT /v1/activities/{id} avec nouvelle date/heure
  // 4. Si non trouvée → POST /v1/activities avec dealId + type + date + heure + sujet
  // 5. Retourner {action: "updated"|"created", activity_id}
}
```

**Remplacer tous les appels `POST /v1/activities` dans:**
- `traiterNouveauLead()` → utiliser `upsertActivite()`
- `creerActivite()` tool MCP → utiliser `upsertActivite()`
- Toute fonction qui crée une activité de suivi

**Modifier l'outil MCP `creer_activite` pour:**
1. Appeler `voir_activites(dealId)` d'abord
2. Si activité même type existe → modifier au lieu de créer
3. Sinon créer

### RÈGLE DE REPORT DE DATE:
- Activité dépassée (date < aujourd'hui) → reporter à J+1 ouvrable (lundi si vendredi)
- Pas de doublons même type même jour
- Si visite planifiée → garder la date (ne pas toucher sans confirmation Shawn)

---

## 🛡️ MISSION PRIORITAIRE — SYSTÈME DE PROTECTION COMPLET

**Demande Shawn:** "Prévenir plutôt que guérir — système de protection qui règle tout avant que ça arrive."

**Fichier à lire EN PREMIER:** `PROTECTION_SYSTEM.md` (déjà dans le repo)

---

## 🆕 ÉTAPE 0 — Outil `supprimer_activite` + dédup automatique

**Problème:** Quand le bot crée plusieurs activités J+1 pour le même prospect, il y a des doublons (ex: Lounes 20 activités, Jeannot 20 activités).

**Solution:**

1. **Outil MCP `supprimer_activite`** dans bot.js:
```javascript
{
  name: "supprimer_activite",
  description: "Supprimer une activité Pipedrive (doublon, erreur). Affiche d'abord les activités du deal pour choisir.",
  parameters: {
    terme: { type: "string" },          // nom prospect → affiche liste
    activity_id: { type: "number" }     // ID direct si connu
  }
}
```

2. **Fonction `dedupActivites(dealId)`:**
```javascript
async function dedupActivites(dealId) {
  // GET /v1/deals/{id}/activities?done=0
  // Grouper par type
  // Garder la plus récente de chaque type
  // DELETE toutes les autres
  // Retourner nb supprimées
}
```

3. **Appeler `dedupActivites()` AVANT `upsertActivite()`** dans tout flow

4. **Règle absolue:** 1 seule activité "appel" par deal à la fois.

---

## 🛡️ CE QUE TU DOIS IMPLÉMENTER (dans l'ordre)

### ÉTAPE 0.5 — Fonction `upsertActivite()` (10 min) ← NOUVEAU
- Remplace tous les `POST /v1/activities` bruts
- Vérifie existence → modifie OU crée
- Appliqué dans tool MCP `creer_activite` + `traiterNouveauLead()`

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
node validate.js
git add -A && git commit -m "[PROTECTION N1] Alerte J+1 automatique"
git push origin main
# Attendre 90 secondes
curl https://signaturesb-bot-s272.onrender.com/health
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

1. Ne JAMAIS deviner l'année — date courante: 2026-04-28
2. Toujours `node validate.js` avant push
3. Attendre 90s après push pour que Render redémarre
4. Vérifier `/health` après chaque déploiement
5. Si erreur Render → vérifier logs Render dashboard
6. DATA_DIR = détecter auto (`/data/` si existe, sinon `./data/`)
7. **RÈGLE ACTIVITÉS:** `upsertActivite()` partout — jamais POST brut
8. **RÈGLE ACTIVITÉS:** 1 seule activité active par type par deal
9. **RÈGLE ACTIVITÉS:** Activité dépassée → reporter au prochain jour ouvrable
10. **RÈGLE ACTIVITÉS:** Toujours créer sur le deal du prospect, jamais sur un deal séparé

---

*Sync: Kira bot Telegram ↔ Claude Code — 2026-04-28 00:32*
