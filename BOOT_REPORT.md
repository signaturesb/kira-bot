# ✅ Boot réussi
_2026-06-01 01 h 13 min 03 s_

- Modèle: claude-sonnet-4-6
- Outils: 65
- Uptime: 19s
- Centris: ⏳
- Dropbox: ✅

## Logs boot (150 dernières lignes)
```
INFO|BOOT|Step 0: server.listen(10000) [CRITICAL]
INFO|BOOT|Step 1: refresh Dropbox token
OK|BOOT|HTTP server listening on port 10000
OK|DROPBOX|Token rafraîchi ✓ (exp dans 240min)
INFO|BOOT|Step 1b: load secrets (local persistent disk + Dropbox)
INFO|SECRETS|Dossier /bot-secrets absent (normal si jamais utilisé)
INFO|BOOT|Step 2: load Dropbox structure + index
OK|DROPBOX|Structure: 87 listings (Terrain en ligne: 54, Inscription: 33), 5 sections
INFO|DBX_IDX|Paths à indexer: /Inscription | /Terrain en ligne
INFO|BOOT|Step 2b: refresh mailing plan (Brevo)
INFO|BOOT|Step 3: init Gist
OK|GIST|Configuré: a9a1a92fef67d6d3d7bddeaed5359f44
INFO|BOOT|Step 4: load memory + history
OK|GIST|155 faits chargés
OK|GIST|History restauré depuis Gist: 4 messages sur 1 chats (dernière save: 2026-06-01T03:37:45.142Z)
INFO|BOOT|Step 5: load session live context
OK|DBX_IDX|1 dossiers fusionnés cross-source (même Centris#/adresse)
OK|DBX_IDX|Index: 87 dossiers, 432 fichiers · 1s · 73 Centris# · 59 tokens rue
OK|MAILING|Plan refreshed: 5 pending · 7 récentes
OK|SYNC|SESSION_LIVE.md chargé depuis kira-bot (10KB, age 277h)
INFO|BOOT|Step 5b: pre-warm master email template
OK|TEMPLATE|Master template chargé 62KB
OK|BOOT|Master template chargé (61.7 KB) — logos Signature SB + RE/MAX prêts
OK|POLLER|Intervalle polling: 30s (quasi-instantané)
OK|BOOT|Gmail Lead Poller + auto-trash CI noise (boot+2h cycle) activés
INFO|BOOT|Step 6: registerHandlers
INFO|BOOT|Step 7: startDailyTasks
OK|CRON|Tâches: visites 7h, digest 8h→Julie, sync BOT_STATUS chaque heure, monitoring 10min
INFO|BOOT|Step 8: configuration WEBHOOK Telegram (auto-healing bulletproof)
OK|BOOT|✅ Kira démarrée [claude-sonnet-4-6] — /tmp — mémos:155 — tools:65 — port:10000
OK|PREFLIGHT|✅ Claude API accepte les 65 tools
OK|WEBHOOK|Sync OK (boot) — secret=set
INFO|AUDIT|webhook/synced {"reason":"boot","hasSecret":true}
OK|GIST|Poller state restauré: 500 processed, 163 leads
OK|GIST|Dedup restauré: 40 entries
INFO|BOOT|Boot catch-up scan 4h — récupération leads pendant redeploy
OK|GMAIL|Token rafraîchi ✓
WARN|CENTRIS|OAuth flow échoué: Exception: fetch failed — fallback form-based
WARN|CENTRIS|Login: HTTP 200 — location: 
WARN|CENTRIS|Pré-login échoué — retry automatique à la première requête
OK|AI_PARSER|Extracted (sonnet tool-use): nom=false tel=false email=false centris=false adresse=true conf={"nom":0,"telephone":0,"email":0,"centris":0,"adresse":0}
WARN|POLLER|Lead non viable: "Votre code MFA pour Centris" (Centris.ca) — PROBLÈME P0
OK|BOOT|✅ Pre-flight: 9/9 OK
```
