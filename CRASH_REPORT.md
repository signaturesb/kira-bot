# 🚨 uncaughtException
_2026-05-17 05 h 16 min 30 s_

## Erreur
```
m is not defined
ReferenceError: m is not defined
    at Timeout._onTimeout (/opt/render/project/src/bot.js:11262:20)
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
INFO|BOOT|Step 2c: catch-up veille J-1 (boot dans fenêtre 20h Eastern)
INFO|VEILLE|Backup check campagnes suspended pour demain...
INFO|BOOT|Step 3: init Gist
OK|GIST|Configuré: a9a1a92fef67d6d3d7bddeaed5359f44
INFO|BOOT|Step 4: load memory + history
OK|GIST|130 faits chargés
OK|GIST|History restauré depuis Gist: 6 messages sur 1 chats (dernière save: 2026-05-17T00:10:04.937Z)
INFO|BOOT|Step 5: load session live context
OK|SYNC|SESSION_LIVE.md chargé (6KB)
OK|POLLER|Intervalle polling: 30s (quasi-instantané)
OK|BOOT|Gmail Lead Poller + auto-trash CI noise activés
INFO|BOOT|Step 6: registerHandlers
INFO|BOOT|Step 7: startDailyTasks
OK|CRON|Tâches: visites 7h, digest 8h→Julie, sync BOT_STATUS chaque heure, monitoring 10min
INFO|BOOT|Step 8: configuration WEBHOOK Telegram (auto-healing bulletproof)
OK|BOOT|✅ Kira démarrée [claude-sonnet-4-6] — /tmp — mémos:130 — tools:61 — port:10000
OK|DBX_IDX|1 dossiers fusionnés cross-source (même Centris#/adresse)
OK|DBX_IDX|Index: 76 dossiers, 376 fichiers · 1s · 69 Centris# · 55 tokens rue
INFO|VEILLE|Aucune campagne pour demain (2026-05-17)
OK|MAILING|Plan refreshed: 6 pending · 8 récentes
INFO|CENTRIS-OAUTH|hop 0 → https://accounts.centris.ca/connect/authorize?client_id=00DB706E-3B35-4CCA-8915-57DD3E1633E8&redirect_uri=https://matrix
INFO|CENTRIS-OAUTH|hop 0 302 → location: https://centris-prod.ca.auth0.com/authorize?client_id=x7YZXkUKRSCWB0X4hg0TT9oLw6fDw1W1&redirect_uri=https%3A%2F%2Faccoun
INFO|CENTRIS-OAUTH|hop 1 → https://centris-prod.ca.auth0.com/authorize?client_id=x7YZXkUKRSCWB0X4hg0TT9oLw6fDw1W1&redirect_uri=https%3A%2F%2Faccoun
INFO|CENTRIS-OAUTH|hop 1 302 → location: https://accounts.centris.ca/connect/authorize?redirect_uri=https%3A%2F%2Fcentris-prod.ca.auth0.com%2Flogin%2Fcallback&re
INFO|CENTRIS-OAUTH|hop 2 → https://accounts.centris.ca/connect/authorize?redirect_uri=https%3A%2F%2Fcentris-prod.ca.auth0.com%2Flogin%2Fcallback&re
INFO|CENTRIS-OAUTH|hop 2 302 → location: https://centris-prod.ca.auth0.com/login/callback?code=dEY5MEqq6qpwpjTfLDwVyhiz3Q2fPehXIyMzuMthTHk&state=bwvdJeb-mnT-zwAx
INFO|CENTRIS-OAUTH|hop 3 → https://centris-prod.ca.auth0.com/login/callback?code=dEY5MEqq6qpwpjTfLDwVyhiz3Q2fPehXIyMzuMthTHk&state=bwvdJeb-mnT-zwAx
OK|PREFLIGHT|✅ Claude API accepte les 61 tools
INFO|CENTRIS-OAUTH|hop 3 302 → location: /authorize/resume?state=hrLiroTvXz9q5-_KhWJ0WYgNagm9-Y16
INFO|CENTRIS-OAUTH|hop 4 → https://centris-prod.ca.auth0.com/authorize/resume?state=hrLiroTvXz9q5-_KhWJ0WYgNagm9-Y16
INFO|CENTRIS-OAUTH|hop 4 302 → location: /u/mfa-sms-challenge?state=hKFo2SA1bWFnSm54NTZyYVVNcERLOXNtanJYNld2Wk9oN29IM6FusG1mYS1hdXRoZW50aWNhdGWjdGlk2SBockxpcm9Ud
INFO|CENTRIS-OAUTH|hop 5 → https://centris-prod.ca.auth0.com/u/mfa-sms-challenge?state=hKFo2SA1bWFnSm54NTZyYVVNcERLOXNtanJYNld2Wk9oN29IM6FusG1mYS1h
WARN|CENTRIS-OAUTH|hop 5 STUCK at https://centris-prod.ca.auth0.com/u/mfa-sms-challenge?state=hKFo2SA1bWFnSm54NTZy — HTML: <!DOCTYPE html> <html lang="fr-CA"> <head> <meta charset="utf-8"> <meta http-equiv="X-UA-Compatible" content="IE=edge"> <meta name="viewport" content="width=device-width, initial-scale=1"> <meta name=
WARN|CENTRIS|OAuth flow échoué: Pas de form_post matrix après auth — fallback form-based
OK|WEBHOOK|Sync OK (boot) — secret=set
INFO|AUDIT|webhook/synced {"reason":"boot","hasSecret":true}
WARN|CENTRIS|Login: HTTP 200 — location: 
WARN|CENTRIS|Pré-login échoué — retry automatique à la première requête
OK|GIST|Poller state restauré: 376 processed, 120 leads
OK|GIST|Dedup restauré: 26 entries
INFO|BOOT|Boot catch-up scan 4h — récupération leads pendant redeploy
OK|GMAIL|Token rafraîchi ✓
WARN|SECURITY|SMS bridge bad HMAC from ::ffff:10.30.189.132
OK|BOOT|✅ Pre-flight: 9/9 OK
OK|BOOT|BOOT_REPORT.md écrit dans GitHub
OK|HEALTH|Anthropic OK (healthcheck Haiku)
OK|CLEANUP|Auto-trashed 1 emails (GitHub + Render + PaaS)
OK|SYNC|BOT_STATUS.md → kira-bot (stats anonymes, 100 deals)
OK|HEALTH|all green: pipedrive=✅ brevo=✅ dropbox=✅ anthropic=✅ transcribe=✅
INFO|VEILLE|Backup check campagnes suspended pour demain...
INFO|VEILLE|Aucune campagne pour demain (2026-05-17)
```

## Environnement
- Node: v22.22.0
- Platform: linux
- Memory: {"rss":125550592,"heapTotal":34832384,"heapUsed":30749952,"external":8063634,"arrayBuffers":4388781}
- Env vars présents: 144

**Claude Code peut lire ce fichier avec:**
`read_github_file(repo='kira-bot', path='CRASH_REPORT.md')`