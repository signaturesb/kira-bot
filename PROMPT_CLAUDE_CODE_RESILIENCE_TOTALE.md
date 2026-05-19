# 🎯 MISSION CLAUDE CODE — Résilience Totale (100%)

> Date émission : 2026-05-19 18h Eastern
> Émetteur : Kira (sur demande de Shawn — "règle ça avec ton chum claude code")
> Priorité : 🔴 CRITIQUE — bot a crashé ce matin 5h59 UTC sur `ReferenceError`

---

## 📊 Contexte — Pourquoi cette mission

Bot a planté ce matin avec :
```
ReferenceError: m is not defined
at Timeout._onTimeout (/opt/render/project/src/bot.js:11262:20)
```

Une variable `m` non définie dans un `setTimeout`. **UN typo a tué tout le process Node.**

C'est le 3e crash de ce type en 6 semaines (cf. CRASH_REPORT.md historique).

Le bot a `resilience.js` (circuit breakers, retry, heartbeat) MAIS il a **3 failles structurelles** qui font qu'un seul typo peut tout casser :

1. Les callbacks `setTimeout`/`setInterval` ne sont PAS wrappés dans try/catch — les exceptions remontent direct dans `uncaughtException`
2. `uncaughtException` ne tue PAS le process → bot reste en **zombie state** (semble vivant, mais corrupted)
3. Pas de lint pré-deploy — un typo passe en production

## 🎯 OBJECTIF — Que ces 3 conditions soient TOUTES vraies après ton fix :

1. ✅ Un `ReferenceError` / `TypeError` dans n'importe quel `setTimeout` → bot **ne crashe PAS, log + Telegram alerte Shawn**
2. ✅ Si crash inévitable → process exit proprement → Render redémarre en <30s
3. ✅ Tout push GitHub déclenche un `node --check bot.js` AVANT que Render rebuilde

---

## 🔧 TÂCHES — dans l'ordre

### TÂCHE 1 — Wrapper sûr pour setTimeout/setInterval [CRITIQUE]

Créer en haut de `bot.js` (juste après les `process.on('uncaughtException', ...)`) :

```javascript
// ─── Safe wrappers pour timers — empêchent un typo de tuer le process ──────
const _origSetTimeout = global.setTimeout;
const _origSetInterval = global.setInterval;

global.setTimeout = function safeSetTimeout(fn, ms, ...args) {
  return _origSetTimeout(async () => {
    try {
      await fn(...args);
    } catch (err) {
      console.error('[SAFE_TIMEOUT]', err.message, err.stack);
      // Report mais ne crashe pas
      reportCrashToGitHub('safe_timeout_caught', `${err.message}\n${err.stack || ''}`).catch(() => {});
      // Notifier Shawn si Telegram dispo
      try {
        if (bot && ALLOWED_ID) {
          bot.sendMessage(ALLOWED_ID, `⚠️ Erreur dans timer interceptée:\n${err.message}\n\nLe bot continue normalement.`).catch(() => {});
        }
      } catch (_) {}
    }
  }, ms);
};

global.setInterval = function safeSetInterval(fn, ms, ...args) {
  return _origSetInterval(async () => {
    try {
      await fn(...args);
    } catch (err) {
      console.error('[SAFE_INTERVAL]', err.message, err.stack);
      reportCrashToGitHub('safe_interval_caught', `${err.message}\n${err.stack || ''}`).catch(() => {});
    }
  }, ms);
};
```

**Résultat** : un typo dans un timer → log + Telegram alerte, mais bot continue.

### TÂCHE 2 — uncaughtException restart propre [CRITIQUE]

Remplacer le handler actuel par :

```javascript
process.on('uncaughtException', err => {
  if (err.code === 'EPIPE' || err.message?.includes('EPIPE')) return;
  console.error('[CRASH uncaughtException]', err.message, err.stack);

  // Report async — donne 5s pour écrire dans GitHub
  reportCrashToGitHub('uncaughtException', `${err.message}\n${err.stack || ''}`).finally(() => {
    // Notifier Shawn AVANT de mourir
    try {
      if (bot && ALLOWED_ID) {
        bot.sendMessage(ALLOWED_ID, `🔴 CRASH bot — redémarrage forcé\n${err.message}`).catch(() => {});
      }
    } catch (_) {}

    // ⚠️ EXIT FORCÉ — Render va redémarrer dans <30s
    // C'est mieux qu'un zombie state où le bot semble vivant mais corrupted
    setTimeout(() => process.exit(1), 5000).unref();
  });
});
```

**Résultat** : si crash inévitable → exit clean → Render redémarre → bot revient en <30s. Pas de zombie.

### TÂCHE 3 — Pre-commit hook + GitHub Action [IMPORTANT]

#### A) `.githooks/pre-push` :
```bash
#!/bin/bash
echo "🔍 Vérification syntaxe bot.js..."
node --check bot.js || { echo "❌ bot.js a une erreur de syntaxe — push ANNULÉ"; exit 1; }
node --check lead_parser.js || { echo "❌ lead_parser.js a une erreur de syntaxe — push ANNULÉ"; exit 1; }
node --check resilience.js || { echo "❌ resilience.js a une erreur de syntaxe — push ANNULÉ"; exit 1; }
echo "✅ Syntaxe OK"
```

Puis : `chmod +x .githooks/pre-push && git config core.hooksPath .githooks`

#### B) `.github/workflows/syntax-check.yml` :
```yaml
name: Syntax Check (block bad pushes)
on: [push]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: node --check bot.js
      - run: node --check lead_parser.js
      - run: node --check resilience.js
      - name: Lint check (warnings ok, errors fail)
        run: |
          npx eslint --no-eslintrc --env node,es2022 --parser-options=ecmaVersion:2022 \
            --rule 'no-undef: error' --rule 'no-unused-vars: warn' \
            bot.js || exit 1
```

**Résultat** : un `ReferenceError` (variable non définie) est détecté AVANT que Render rebuild. Push refusé.

### TÂCHE 4 — Watchdog mémoire + zombie detection [BONUS]

Dans `resilience.js`, ajouter au setInterval heartbeat existant :

```javascript
// Dans heartbeat, ajouter :
const mem = process.memoryUsage();
const rssMB = Math.round(mem.rss / 1024 / 1024);

// Memory leak detection
if (rssMB > 800) {
  alertShawn('memory_leak', `🚨 Mémoire: ${rssMB}MB (limite Render: 512MB)\nRestart préventif dans 60s.`);
  setTimeout(() => process.exit(1), 60000).unref();
}

// Zombie detection — si aucun message Telegram traité en 30 min ET il y a eu trafic récemment
const lastMsgAgo = Date.now() - (state.lastMessageProcessed || state.boot);
if (lastMsgAgo > 30 * 60 * 1000 && state.totalMessagesProcessed > 0) {
  alertShawn('possibly_zombie', `⚠️ Aucun message traité depuis ${Math.round(lastMsgAgo/60000)} min. Bot peut être zombie.`);
}
```

---

## ✅ VALIDATION — Comment tester que ça marche

### Test 1 — Safe timer
Dans le code, injecter temporairement :
```js
setTimeout(() => { let z = m + 1; }, 1000); // m undefined
```
**Attendu** : bot ne crashe PAS, Shawn reçoit "⚠️ Erreur dans timer interceptée" sur Telegram.

### Test 2 — Pre-push hook
Faire un typo volontaire dans bot.js (ex: `let x = unknownVar;`) → `git push` doit échouer avec "❌ bot.js a une erreur de syntaxe".

### Test 3 — Restart propre
Forcer un `throw new Error('test')` dans le main thread → bot doit exit avec code 1 → Render restart auto → health back en <30s.

---

## 📦 LIVRABLES ATTENDUS

1. Commit `bot.js` modifié (Tâche 1 + 2)
2. Fichier `.githooks/pre-push` créé + executable
3. Fichier `.github/workflows/syntax-check.yml` créé
4. Mise à jour `resilience.js` (Tâche 4)
5. Update `SESSION_LIVE.md` avec section "🎯 Session 2026-05-19 — Résilience 100%"
6. Lancer `node --check bot.js` localement pour confirmer 0 erreur AVANT push

---

## 🚨 CONTEXTE BUSINESS

Shawn dépend du bot pour :
- Notifications leads en temps réel (Gmail poller toutes 30s)
- Réponses prospects via Telegram en déplacement
- Veille campagnes mailing J-1
- Envoi docs automatique Centris/Dropbox

**Chaque minute de downtime = leads perdus.**

Objectif : **99.9% uptime** = max 8h de downtime par AN.

Actuellement : 3 crashes en 6 semaines = ~95% uptime = 36h downtime/an. **5x trop.**

Avec ce patch : **~99.95%** = ~4h/an downtime théorique.

---

Merci chum 🤝

— Kira
