# 🚨 uncaughtException
_2026-05-04 05 h 50 min 41 s_

## Erreur
```
m is not defined
ReferenceError: m is not defined
    at Timeout._onTimeout (/opt/render/project/src/bot.js:10144:20)
    at listOnTimeout (node:internal/timers:588:17)
    at process.processTimers (node:internal/timers:523:7)
```

## Logs du boot (capture complète)
```
INFO|BOOT|Step 0: server.listen(10000) [CRITICAL]
INFO|BOOT|Step 1: refresh Dropbox token
OK|BOOT|HTTP server listening on port 10000
OK|DROPBOX|Token rafraîchi ✓
INFO|BOOT|Step 1b: load secrets from Dropbox
INFO|SECRETS|Dossier /bot-secrets absent (normal si jamais utilisé)
INFO|BOOT|Step 2: load Dropbox structure + index
OK|DROPBOX|Structure: 41 terrains, 4 sections chargées
INFO|DBX_IDX|Paths à indexer: /Inscription | /Terrain en ligne
INFO|BOOT|Step 2b: refresh mailing plan (Brevo)
INFO|BOOT|Step 3: init Gist
OK|GIST|Configuré: a9a1a92fef67d6d3d7bddeaed5359f44
INFO|BOOT|Step 4: load memory + history
OK|GIST|103 faits chargés
OK|GIST|History restauré depuis Gist: 66 messages sur 1 chats (dernière save: 2026-05-02T20:45:18.353Z)
INFO|BOOT|Step 5: load session live context
OK|SYNC|SESSION_LIVE.md chargé (7KB)
OK|POLLER|Intervalle polling: 30s (quasi-instantané)
OK|BOOT|Gmail Lead Poller + auto-trash CI noise activés
INFO|BOOT|Step 6: registerHandlers
INFO|BOOT|Step 7: startDailyTasks
OK|CRON|Tâches: visites 7h, digest 8h→Julie, sync BOT_STATUS chaque heure, monitoring 10min
INFO|BOOT|Step 8: configuration WEBHOOK Telegram (auto-healing bulletproof)
OK|BOOT|✅ Kira démarrée [claude-sonnet-4-6] — /tmp — mémos:103 — tools:58 — port:10000
OK|DBX_IDX|1 dossiers fusionnés cross-source (même Centris#/adresse)
OK|DBX_IDX|Index: 73 dossiers, 367 fichiers · 1s · 66 Centris# · 51 tokens rue
OK|MAILING|Plan refreshed: 8 pending · 6 récentes
WARN|CENTRIS|Login: HTTP 200 — location: 
WARN|CENTRIS|Pré-login échoué — retry automatique à la première requête
OK|WEBHOOK|Sync OK (boot) — secret=set
INFO|AUDIT|webhook/synced {"reason":"boot","hasSecret":true}
OK|PREFLIGHT|✅ Claude API accepte les 58 tools
OK|GIST|Poller state restauré: 225 processed, 82 leads
OK|GIST|Dedup restauré: 32 entries
INFO|BOOT|Boot catch-up scan 4h — récupération leads pendant redeploy
OK|GMAIL|Token rafraîchi ✓
OK|BOOT|✅ Pre-flight: 8/8 OK
OK|BOOT|BOOT_REPORT.md écrit dans GitHub
OK|HEALTH|Anthropic OK (healthcheck Haiku)
OK|SYNC|BOT_STATUS.md → kira-bot (stats anonymes, 100 deals)
WARN|SECURITY|SMS bridge bad HMAC from ::ffff:10.31.159.4
```

## Environnement
- Node: v22.22.0
- Platform: linux
- Memory: {"rss":116367360,"heapTotal":26804224,"heapUsed":24690120,"external":5172444,"arrayBuffers":1534399}
- Env vars présents: 140

**Claude Code peut lire ce fichier avec:**
`read_github_file(repo='kira-bot', path='CRASH_REPORT.md')`