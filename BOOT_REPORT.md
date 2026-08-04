# ✅ Boot réussi
_2026-08-04 10 h 11 min 32 s_

- Modèle: claude-sonnet-4-6
- Outils: 65
- Uptime: 20s
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
OK|DROPBOX|Structure: 105 listings (Terrain en ligne: 64, Inscription: 41), 5 sections
INFO|DBX_IDX|Paths à indexer: /Inscription | /Terrain en ligne
INFO|BOOT|Step 2b: refresh mailing plan (Brevo)
INFO|BOOT|Step 3: init Gist
OK|GIST|Configuré: a9a1a92fef67d6d3d7bddeaed5359f44
INFO|BOOT|Step 4: load memory + history
OK|GIST|200 faits chargés
OK|GIST|History restauré depuis Gist: 4 messages sur 1 chats (dernière save: 2026-08-02T15:32:31.766Z)
INFO|BOOT|Step 5: load session live context
OK|DBX_IDX|1 dossiers fusionnés cross-source (même Centris#/adresse)
OK|DBX_IDX|Index: 105 dossiers, 640 fichiers · 1s · 92 Centris# · 74 tokens rue
OK|SYNC|SESSION_LIVE.md chargé depuis bot-assistant (2KB, age 1533h)
INFO|BOOT|Step 5b: pre-warm master email template
OK|MAILING|Plan refreshed: 8 pending · 8 récentes
OK|TEMPLATE|Master template chargé 62KB
OK|BOOT|Master template chargé (61.7 KB) — logos Signature SB + RE/MAX prêts
OK|POLLER|Intervalle polling: 30s (quasi-instantané)
OK|BOOT|Gmail Lead Poller + auto-trash CI noise (boot+2h cycle) activés
INFO|BOOT|Step 6: registerHandlers
INFO|BOOT|Step 7: startDailyTasks
OK|CRON|Tâches: visites 7h, digest 8h→Julie, sync BOT_STATUS chaque heure, monitoring 10min
INFO|BOOT|Step 8: configuration WEBHOOK Telegram (auto-healing bulletproof)
OK|BOOT|✅ Kira démarrée [claude-sonnet-4-6] — /tmp — mémos:200 — tools:65 — port:10000
INFO|CENTRIS-OAUTH|hop 0 → https://accounts.centris.ca/connect/authorize?client_id=00DB706E-3B35-4CCA-8915-57DD3E1633E8&redirect_uri=https://matrix
INFO|CENTRIS-OAUTH|hop 0 302 → location: https://centris-prod.ca.auth0.com/authorize?client_id=x7YZXkUKRSCWB0X4hg0TT9oLw6fDw1W1&redirect_uri=https%3A%2F%2Faccoun
INFO|CENTRIS-OAUTH|hop 1 → https://centris-prod.ca.auth0.com/authorize?client_id=x7YZXkUKRSCWB0X4hg0TT9oLw6fDw1W1&redirect_uri=https%3A%2F%2Faccoun
INFO|CENTRIS-OAUTH|hop 1 302 → location: https://accounts.centris.ca/connect/authorize?redirect_uri=https%3A%2F%2Fcentris-prod.ca.auth0.com%2Flogin%2Fcallback&re
INFO|CENTRIS-OAUTH|hop 2 → https://accounts.centris.ca/connect/authorize?redirect_uri=https%3A%2F%2Fcentris-prod.ca.auth0.com%2Flogin%2Fcallback&re
INFO|CENTRIS-OAUTH|hop 2 302 → location: https://centris-prod.ca.auth0.com/login/callback?code=YI9DzgMNNvGUbpJe1xHQ-Jzpu2_Fnt9P66JODwMZ9rw&state=DhHlhAUCy2XQsZ2f
INFO|CENTRIS-OAUTH|hop 3 → https://centris-prod.ca.auth0.com/login/callback?code=YI9DzgMNNvGUbpJe1xHQ-Jzpu2_Fnt9P66JODwMZ9rw&state=DhHlhAUCy2XQsZ2f
INFO|CENTRIS-OAUTH|hop 3 302 → location: /authorize/resume?state=VtvHmZ4j2N26ER4crPGK4JNhfmIs9W68
INFO|CENTRIS-OAUTH|hop 4 → https://centris-prod.ca.auth0.com/authorize/resume?state=VtvHmZ4j2N26ER4crPGK4JNhfmIs9W68
INFO|CENTRIS-OAUTH|hop 4 302 → location: /u/mfa-sms-challenge?state=hKFo2SBUaGNMMXdRYnlqdmYzN01VVU53NjdQTWY0WVBMVklySKFusG1mYS1hdXRoZW50aWNhdGWjdGlk2SBWdHZIbVo0a
INFO|CENTRIS-OAUTH|hop 5 → https://centris-prod.ca.auth0.com/u/mfa-sms-challenge?state=hKFo2SBUaGNMMXdRYnlqdmYzN01VVU53NjdQTWY0WVBMVklySKFusG1mYS1h
WARN|CENTRIS-OAUTH|hop 5 STUCK at https://centris-prod.ca.auth0.com/u/mfa-sms-challenge?state=hKFo2SBUaGNMMXdRYnlq — HTML: <!DOCTYPE html> <html lang="fr-CA"> <head> <meta charset="utf-8"> <meta http-equiv="X-UA-Compatible" content="IE=edge"> <meta name="viewport" content="width=device-width, initial-scale=1"> <meta name=
WARN|CENTRIS|OAuth flow échoué: Pas de form_post matrix après auth — fallback form-based
WARN|CENTRIS|Login: HTTP 200 — location: 
WARN|CENTRIS|Pré-login échoué — retry automatique à la première requête
OK|PREFLIGHT|✅ Claude API accepte les 65 tools
OK|WEBHOOK|Sync OK (boot) — secret=set
INFO|AUDIT|webhook/synced {"reason":"boot","hasSecret":true}
OK|GIST|Poller state restauré: 500 processed, 403 leads
OK|GIST|Dedup restauré: 53 entries
INFO|BOOT|Boot catch-up scan 4h — récupération leads pendant redeploy
OK|GMAIL|Token rafraîchi ✓
OK|BOOT|✅ Pre-flight: 8/9 OK
INFO|AUDIT|boot/preflight_issues {"failed":[{"label":"Pipedrive API","detail":"échec"}]}
```
