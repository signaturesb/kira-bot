# SESSION LIVE — 2026-05-14 (mis à jour)

## 🔴 PRIORITÉ #1 AUJOURD'HUI — ZONAGE PDF → TELEGRAM → EMAIL

**Demande Shawn (14 mai 2026):** Scraper intelligent zonage → grille PDF dans Telegram → Shawn dit "envoie à email@" → bot envoie au client avec Shawn en Cc.

**Fichier à lire EN PREMIER:** `ZONAGE_PDF_WORKFLOW.md` (créé aujourd'hui)

### ÉTAPES À FAIRE (dans l'ordre):

**1. Ajouter FIRECRAWL_API_KEY dans Render (2 min)**
- Dashboard Render → signaturesb-bot-s272 → Environment
- Ajouter: `FIRECRAWL_API_KEY=fc-52e378f6759746e4807406ddc3517d07`
- Ajouter: `FIRECRAWL_QUOTA_MONTHLY=500`

**2. Ajouter dans bot.js (lire ZONAGE_PDF_WORKFLOW.md section par section):**
```
- Import pdf-lib (déjà dans package.json ✅)
- Import firecrawl_scraper.js (déjà présent ✅)
- Fonction analyserZonageRue(adresse, ville)
- Fonction extractZoneFromRue(markdown, adresse)  
- Fonction extractGrilleZone(markdown, zone)
- Fonction genererPDFZonage(data) → Buffer via pdf-lib
- Fonction envoyerZonageTelegram(data, chatId)
- Fonction envoyerZonageEmail(emailClient, chatId)
- Fonction verifierTriplex(grille)
- Détection pattern "envoie à email@" dans handler Telegram
- Détection pattern "zonage [rue] [ville]" → déclenche workflow
```

**3. Test live avec: "zonage rue Aumont Saint-Calixte"**

### RÉSULTAT ATTENDU:
```
Shawn: "zonage rue Aumont Saint-Calixte"
Bot: scrape → trouve zone → génère PDF → envoie dans Telegram
Bot: "Zone R-2 identifiée. Triplex: à vérifier. Dis 'envoie à email@' pour transférer."
Shawn: "envoie à client@email.com"  
Bot: Email envoyé au client, Shawn en Cc ✅
```

### NOTE TRIPLEX (question initiale):
- Zone R-1 → unifamilial seulement ❌
- Zone R-2 → bifamilial standard, triplex à vérifier
- Zone R-3 ou M → triplex permis ✅
- Bot indique automatiquement dans le PDF

### PDF GÉNÉRÉ AVEC pdf-lib (pas PDFKit):
- `pdf-lib` déjà dans package.json ✅
- Fond #0a0a0a, rouge #aa0721, style Signature SB
- Tableau: zone, marges, hauteur max, superficie min, usages
- Footer: source, date, téléphone municipalité, shawn@signaturesb.com
- Sauvegardé dans /data/last_zonage.pdf pour envoi email ultérieur
- Contexte sauvegardé dans /data/last_zonage_context.json

---

## 🎯 RÈGLE ABSOLUE ACTIVITÉS (priorité #2)

**Demande Shawn (28 avril 2026):** NE PAS créer doublon — mettre à jour activité existante avec nouvelle date.

### LOGIQUE:
```
AVANT toute création d'activité → vérifier si activité du même type existe:
SI trouvée → MODIFIER date (PUT /v1/activities/{id})
SI non trouvée → CRÉER (POST /v1/activities)
RÉSULTAT: toujours 1 seule activité active par type par deal
```

### FONCTION upsertActivite(dealId, type, date, heure, sujet):
```javascript
// 1. GET /v1/deals/{dealId}/activities?done=0
// 2. Chercher activité du même type
// 3. Si trouvée → PUT avec nouvelle date
// 4. Si non trouvée → POST nouvelle activité
```

**Remplacer dans:** traiterNouveauLead() + creerActivite() tool MCP

---

## 🛡️ SYSTÈME PROTECTION (priorité #3)

**Fichier:** `PROTECTION_SYSTEM.md`

Ordre d'implémentation:
- N1: Alerte J+1 automatique
- N2: Rapport matin 8h30
- N3: Cron horaire seuils stagnation
- N4: Hygiene CRM quotidienne 9h
- N5: Digest hebdo dimanche 20h

---

## 🔧 VARIABLES D'ENVIRONNEMENT (Render)

- `PIPEDRIVE_API_KEY` ✅
- `TELEGRAM_BOT_TOKEN` ✅
- `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN` ✅
- `DROPBOX_APP_KEY` + `DROPBOX_APP_SECRET` + `DROPBOX_REFRESH_TOKEN` ✅
- `OPENAI_API_KEY` ✅ (Whisper vocal)
- `FIRECRAWL_API_KEY=fc-52e378f6759746e4807406ddc3517d07` ← **AJOUTER MAINTENANT**
- `FIRECRAWL_QUOTA_MONTHLY=500` ← **AJOUTER MAINTENANT**

---

## 🏗️ ARCHITECTURE BOT

- URL: `https://signaturesb-bot-s272.onrender.com`
- Health: `/health`
- Data: `/data/` (persistent disk Render)
- Fichiers data: `last_zonage.pdf`, `last_zonage_context.json`, `pending_alerts.json`

---

## ⚠️ RÈGLES IMPORTANTES

1. Ne JAMAIS deviner l'année — date courante: 2026-05-14
2. Toujours `node validate.js` avant push
3. Attendre 90s après push pour Render
4. Vérifier `/health` après chaque déploiement
5. DATA_DIR = auto (`/data/` si existe, sinon `./data/`)
6. **RÈGLE ACTIVITÉS:** upsertActivite() partout — jamais POST brut
7. **RÈGLE ACTIVITÉS:** 1 seule activité active par type par deal
8. **pdf-lib** = librairie PDF à utiliser (déjà installée, pas PDFKit)
9. **firecrawl_scraper.js** = déjà présent dans le repo ✅

---

*Sync: Kira bot Telegram ↔ Claude Code — 2026-05-14 23:17*
