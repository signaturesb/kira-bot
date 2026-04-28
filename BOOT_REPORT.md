# ✅ Boot réussi
_2026-04-28 00 h 10 min 00 s_

- Modèle: claude-sonnet-4-6
- Outils: 50
- Uptime: 18s
- Centris: ⏳
- Dropbox: ✅

## Logs boot (150 dernières lignes)
```
INFO|BOOT|Step 0: server.listen(10000) [CRITICAL]
INFO|BOOT|Step 1: refresh Dropbox token
OK|BOOT|HTTP server listening on port 10000
OK|DROPBOX|Token rafraîchi ✓
INFO|BOOT|Step 1b: load secrets from Dropbox
INFO|SECRETS|Dossier /bot-secrets absent (normal si jamais utilisé)
INFO|BOOT|Step 2: load Dropbox structure + index
OK|DROPBOX|Structure: 34 terrains, 4 sections chargées
INFO|DBX_IDX|Paths à indexer: /Inscription | /Terrain en ligne
INFO|BOOT|Step 3: init Gist
OK|GIST|Configuré: a9a1a92fef67d6d3d7bddeaed5359f44
INFO|BOOT|Step 4: load memory + history
OK|GIST|195 faits chargés
OK|GIST|History restauré depuis Gist: 18 messages sur 1 chats (dernière save: 2026-04-27T23:56:03.036Z)
INFO|BOOT|Step 5: load session live context
OK|SYNC|SESSION_LIVE.md chargé (5KB)
OK|POLLER|Intervalle polling: 30s (quasi-instantané)
OK|BOOT|Gmail Lead Poller + auto-trash CI noise activés
INFO|BOOT|Step 6: registerHandlers
INFO|BOOT|Step 7: startDailyTasks
OK|CRON|Tâches: visites 7h, digest 8h→Julie, sync BOT_STATUS chaque heure, monitoring 10min
INFO|BOOT|Step 8: configuration WEBHOOK Telegram (auto-healing bulletproof)
OK|BOOT|✅ Kira démarrée [claude-sonnet-4-6] — /tmp — mémos:195 — tools:50 — port:10000
OK|DBX_IDX|1 dossiers fusionnés cross-source (même Centris#/adresse)
OK|DBX_IDX|Index: 65 dossiers, 334 fichiers · 1s · 58 Centris# · 45 tokens rue
WARN|CENTRIS|Login: HTTP 200 — location: 
WARN|CENTRIS|Pré-login échoué — retry automatique à la première requête
OK|PREFLIGHT|✅ Claude API accepte les 50 tools
OK|WEBHOOK|Sync OK (boot) — secret=set
INFO|AUDIT|webhook/synced {"reason":"boot","hasSecret":true}
OK|GIST|Poller state restauré: 141 processed, 56 leads
OK|GIST|Dedup restauré: 57 entries
INFO|BOOT|Boot catch-up scan 4h — récupération leads pendant redeploy
OK|GMAIL|Token rafraîchi ✓
OK|BOOT|✅ Pre-flight: 8/8 OK
```
