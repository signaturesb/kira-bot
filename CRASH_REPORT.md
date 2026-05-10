# 🚨 uncaughtException
_2026-05-10 05 h 11 min 44 s_

## Erreur
```
m is not defined
ReferenceError: m is not defined
    at Timeout._onTimeout (/opt/render/project/src/bot.js:10638:20)
    at listOnTimeout (node:internal/timers:588:17)
    at process.processTimers (node:internal/timers:523:7)
```

## Logs du boot (capture complète)
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
INFO|BOOT|Step 3: init Gist
OK|GIST|Configuré: a9a1a92fef67d6d3d7bddeaed5359f44
INFO|BOOT|Step 4: load memory + history
OK|GIST|135 faits chargés
OK|GIST|History restauré depuis Gist: 4 messages sur 1 chats (dernière save: 2026-05-05T16:52:08.582Z)
INFO|BOOT|Step 5: load session live context
OK|SYNC|SESSION_LIVE.md chargé (7KB)
OK|POLLER|Intervalle polling: 30s (quasi-instantané)
OK|BOOT|Gmail Lead Poller + auto-trash CI noise activés
INFO|BOOT|Step 6: registerHandlers
INFO|BOOT|Step 7: startDailyTasks
OK|CRON|Tâches: visites 7h, digest 8h→Julie, sync BOT_STATUS chaque heure, monitoring 10min
INFO|BOOT|Step 8: configuration WEBHOOK Telegram (auto-healing bulletproof)
OK|BOOT|✅ Kira démarrée [claude-sonnet-4-6] — /tmp — mémos:135 — tools:58 — port:10000
OK|DBX_IDX|1 dossiers fusionnés cross-source (même Centris#/adresse)
OK|DBX_IDX|Index: 76 dossiers, 375 fichiers · 1s · 69 Centris# · 55 tokens rue
OK|MAILING|Plan refreshed: 7 pending · 7 récentes
WARN|CENTRIS|Login: HTTP 200 — location: 
WARN|CENTRIS|Pré-login échoué — retry automatique à la première requête
OK|PREFLIGHT|✅ Claude API accepte les 58 tools
OK|WEBHOOK|Sync OK (boot) — secret=set
INFO|AUDIT|webhook/synced {"reason":"boot","hasSecret":true}
OK|GIST|Poller state restauré: 254 processed, 96 leads
OK|GIST|Dedup restauré: 44 entries
INFO|BOOT|Boot catch-up scan 4h — récupération leads pendant redeploy
OK|GMAIL|Token rafraîchi ✓
OK|BOOT|✅ Pre-flight: 8/8 OK
OK|BOOT|BOOT_REPORT.md écrit dans GitHub
OK|HEALTH|Anthropic OK (healthcheck Haiku)
OK|SYNC|BOT_STATUS.md → kira-bot (stats anonymes, 100 deals)
WARN|HEALTH|1 fail: pipedrive=✅ brevo=✅ dropbox=✅ anthropic=✅ openai=❌
INFO|VEILLE|Backup check campagnes suspended pour demain...
INFO|VEILLE|Aucune campagne pour demain (2026-05-06)
WARN|SECURITY|SMS bridge bad HMAC from ::ffff:10.28.86.133
```

## Environnement
- Node: v22.22.0
- Platform: linux
- Memory: {"rss":135610368,"heapTotal":35549184,"heapUsed":27258896,"external":4251586,"arrayBuffers":610504}
- Env vars présents: 140

**Claude Code peut lire ce fichier avec:**
`read_github_file(repo='kira-bot', path='CRASH_REPORT.md')`