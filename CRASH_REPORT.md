# 🚨 uncaughtException
_2026-05-05 05 h 45 min 43 s_

## Erreur
```
m is not defined
ReferenceError: m is not defined
    at Timeout._onTimeout (/opt/render/project/src/bot.js:10160:20)
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
OK|DROPBOX|Structure: 76 listings (Terrain en ligne: 43, Inscription: 33), 5 sections
INFO|DBX_IDX|Paths à indexer: /Inscription | /Terrain en ligne
INFO|BOOT|Step 2b: refresh mailing plan (Brevo)
INFO|BOOT|Step 3: init Gist
OK|GIST|Configuré: a9a1a92fef67d6d3d7bddeaed5359f44
INFO|BOOT|Step 4: load memory + history
OK|GIST|117 faits chargés
OK|GIST|History restauré depuis Gist: 6 messages sur 1 chats (dernière save: 2026-05-04T19:39:03.471Z)
INFO|BOOT|Step 5: load session live context
OK|SYNC|SESSION_LIVE.md chargé (7KB)
OK|POLLER|Intervalle polling: 30s (quasi-instantané)
OK|BOOT|Gmail Lead Poller + auto-trash CI noise activés
INFO|BOOT|Step 6: registerHandlers
INFO|BOOT|Step 7: startDailyTasks
OK|CRON|Tâches: visites 7h, digest 8h→Julie, sync BOT_STATUS chaque heure, monitoring 10min
INFO|BOOT|Step 8: configuration WEBHOOK Telegram (auto-healing bulletproof)
OK|BOOT|✅ Kira démarrée [claude-sonnet-4-6] — /tmp — mémos:117 — tools:58 — port:10000
OK|DBX_IDX|1 dossiers fusionnés cross-source (même Centris#/adresse)
OK|DBX_IDX|Index: 76 dossiers, 373 fichiers · 1s · 68 Centris# · 56 tokens rue
WARN|CENTRIS|Login: HTTP 200 — location: 
WARN|CENTRIS|Pré-login échoué — retry automatique à la première requête
OK|MAILING|Plan refreshed: 8 pending · 6 récentes
OK|PREFLIGHT|✅ Claude API accepte les 58 tools
OK|WEBHOOK|Sync OK (boot) — secret=set
INFO|AUDIT|webhook/synced {"reason":"boot","hasSecret":true}
OK|GIST|Poller state restauré: 236 processed, 87 leads
OK|GIST|Dedup restauré: 38 entries
INFO|BOOT|Boot catch-up scan 4h — récupération leads pendant redeploy
OK|GMAIL|Token rafraîchi ✓
OK|BOOT|✅ Pre-flight: 8/8 OK
OK|BOOT|BOOT_REPORT.md écrit dans GitHub
IN|MSG|dany-racine@hotmail.com envoie lui ce numéro centris 23457532 celui la
INFO|TOOL|telecharger_fiche_centris({"centris_num":"23457532","email_destination":"dany-racine@hotmail.com"})
WARN|CENTRIS|Login: HTTP 200 — location: 
OK|HEALTH|Anthropic OK (healthcheck Haiku)
OK|SYNC|BOT_STATUS.md → kira-bot (stats anonymes, 100 deals)
OK|AUTO_FACTS|+2 fait(s): [PROPRIETE] Centris #23457532 (1962 rue Notre-Dame) — prospe | [STRATEGIE] Utiliser Dropbox comme fallback pour partager fi
WARN|GIST|Save HTTP 403
IN|MSG|C’est exactement se que je t’avais demander
WARN|GIST|Save history HTTP 403
INFO|TOOL|envoyer_docs_prospect({"terme":"dany-racine@hotmail.com","email":"dany-racine@hotmail.com","centris":")
OK|DOCS|Master template Dropbox utilisé (62KB avec logos) — sections vides retirées + label logo personnalisé + punch référencement + placeholders client strippés
OK|AUTO_FACTS|+2 fait(s): [CLIENT] Dany Racine (dany-racine@hotmail.com) intéressé par | [STRATEGIE] Envoyer docs Dropbox directement au client en ca
WARN|GIST|Save HTTP 403
IN|MSG|Ton login centris servais à rien
INFO|TOOL|envoyer_docs_prospect({"terme":"Dany Racine","email":"dany-racine@hotmail.com","centris":"23457532"})
OK|DOCS|Master template Dropbox utilisé (62KB avec logos) — sections vides retirées + label logo personnalisé + punch référencement + placeholders client strippés
```

## Environnement
- Node: v22.22.0
- Platform: linux
- Memory: {"rss":128245760,"heapTotal":33886208,"heapUsed":29764680,"external":7220498,"arrayBuffers":3582453}
- Env vars présents: 140

**Claude Code peut lire ce fichier avec:**
`read_github_file(repo='kira-bot', path='CRASH_REPORT.md')`