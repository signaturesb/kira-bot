# 🚨 uncaughtException
_2026-04-23 21 h 58 min 05 s_

## Erreur
```
Cannot access 'pendingDocSends' before initialization
ReferenceError: Cannot access 'pendingDocSends' before initialization
    at Object.<anonymous> (/opt/render/project/src/bot.js:177:17)
    at Module._compile (node:internal/modules/cjs/loader:1706:14)
    at Object..js (node:internal/modules/cjs/loader:1839:10)
    at Module.load (node:internal/modules/cjs/loader:1441:32)
    at Function._load (node:internal/modules/cjs/loader:1263:12)
    at TracingChannel.traceSync (node:diagnostics_channel:328:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:237:24)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
    at node:internal/main/run_main_module:36:49
```

## Logs du boot (capture complète)
```

```

## Environnement
- Node: v22.22.0
- Platform: linux
- Memory: {"rss":82391040,"heapTotal":19746816,"heapUsed":17161184,"external":2504616,"arrayBuffers":37835}
- Env vars présents: 140

**Claude Code peut lire ce fichier avec:**
`read_github_file(repo='kira-bot', path='CRASH_REPORT.md')`