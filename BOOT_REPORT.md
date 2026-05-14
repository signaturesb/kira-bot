# ✅ Boot réussi
_2026-05-13 22 h 19 min 28 s_

- Modèle: claude-sonnet-4-6
- Outils: 58
- Uptime: 18s
- Centris: ⏳
- Dropbox: ✅

## Logs boot (150 dernières lignes)
```
INFO|BOOT|Step 0: server.listen(10000) [CRITICAL]
INFO|BOOT|Step 1: refresh Dropbox token
OK|BOOT|HTTP server listening on port 10000
OK|DROPBOX|Token rafraîchi ✓
INFO|BOOT|Step 1b: load secrets (local persistent disk + Dropbox)
INFO|SECRETS|Dossier /bot-secrets absent (normal si jamais utilisé)
INFO|BOOT|Step 2: load Dropbox structure + index
OK|DROPBOX|Structure: 76 listings (Terrain en ligne: 43, Inscription: 33), 5 sections
INFO|DBX_IDX|Paths à indexer: /Inscription | /Terrain en ligne
INFO|BOOT|Step 2b: refresh mailing plan (Brevo)
INFO|BOOT|Step 2c: catch-up veille J-1 (boot dans fenêtre 22h Eastern)
INFO|VEILLE|Backup check campagnes suspended pour demain...
INFO|BOOT|Step 3: init Gist
OK|GIST|Configuré: a9a1a92fef67d6d3d7bddeaed5359f44
INFO|BOOT|Step 4: load memory + history
OK|GIST|172 faits chargés
OK|DBX_IDX|1 dossiers fusionnés cross-source (même Centris#/adresse)
OK|DBX_IDX|Index: 76 dossiers, 376 fichiers · 1s · 69 Centris# · 55 tokens rue
OK|GIST|History restauré depuis Gist: 10 messages sur 1 chats (dernière save: 2026-05-13T23:27:19.159Z)
INFO|BOOT|Step 5: load session live context
OK|SYNC|SESSION_LIVE.md chargé (7KB)
OK|POLLER|Intervalle polling: 30s (quasi-instantané)
OK|BOOT|Gmail Lead Poller + auto-trash CI noise activés
INFO|BOOT|Step 6: registerHandlers
INFO|BOOT|Step 7: startDailyTasks
OK|CRON|Tâches: visites 7h, digest 8h→Julie, sync BOT_STATUS chaque heure, monitoring 10min
INFO|BOOT|Step 8: configuration WEBHOOK Telegram (auto-healing bulletproof)
OK|BOOT|✅ Kira démarrée [claude-sonnet-4-6] — /tmp — mémos:172 — tools:58 — port:10000
WARN|CENTRIS|Login: HTTP 200 — location: 
WARN|CENTRIS|Pré-login échoué — retry automatique à la première requête
INFO|VEILLE|Aucune campagne pour demain (2026-05-14)
OK|MAILING|Plan refreshed: 6 pending · 8 récentes
OK|PREFLIGHT|✅ Claude API accepte les 58 tools
OK|WEBHOOK|Sync OK (boot) — secret=set
INFO|AUDIT|webhook/synced {"reason":"boot","hasSecret":true}
OK|GIST|Poller state restauré: 332 processed, 113 leads
OK|GIST|Dedup restauré: 18 entries
INFO|BOOT|Boot catch-up scan 4h — récupération leads pendant redeploy
OK|GMAIL|Token rafraîchi ✓
OK|BOOT|✅ Pre-flight: 8/8 OK
WARN|SECURITY|SMS bridge bad HMAC from ::ffff:10.27.217.7
```
