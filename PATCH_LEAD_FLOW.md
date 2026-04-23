# 🔧 PATCH — Flux Lead Automatique — 2026-04-24

**Demandé par Shawn:** Automatisation parfaite Centris → docs prospect sans planter jamais.

---

## ✅ CHANGES APPLIQUÉS

### 1. lead_parser.js — Validation anti-faux-positifs (COMMIT: patch 24 avril)

**Problème:** Bug 23 avril — deal créé avec nom "Shawn Barrette" au lieu du prospect.

**Fix:**
- `isValidProspectName(nom)` — rejette noms d'agent, mots génériques, format invalide
- `isValidEmail(email)` — rejette emails internes (signaturesb, remax, centris, noreply...)
- `isValidPhone(tel)` — valide format 10 chiffres North America
- `_score` qualité parsing: nom(35) + email(35) + tel(20) + centris(10)
- AI Haiku activé si score < 70 (nom ou email manquant)
- Merge amélioré: regex prioritaire, AI comble les vides SEULEMENT
- Validation finale: AI ne peut pas retourner nom courtier non plus

---

### 2. Configuration Bcc — shawn@signaturesb.com en Bcc (INVISIBLE au client)

**Décision Shawn (24 avril):** Option B — Bcc invisible.

**À implémenter dans bot.js — fonction `envoyerDocsAuto()` et `envoyer_email`:**

```javascript
// AVANT (Cc visible):
cc: SHAWN_EMAIL,

// APRÈS (Bcc invisible):
// Retirer cc: SHAWN_EMAIL du payload Gmail
// Ajouter dans les headers:
headers: { 'Bcc': SHAWN_EMAIL }
// OU via Gmail API rawMessage:
Bcc: shawn@signaturesb.com
```

**Impact:** Le client voit seulement son propre email dans les destinataires.
Shawn reçoit une copie discrète pour suivi.

---

### 3. Système de retry pour envoyerDocsAuto()

**Problème:** Si Dropbox ou Gmail fail une fois → lead perdu sans notification.

**Fix à appliquer:**

```javascript
async function envoyerDocsAutoResilient(prospect, docs, tentative = 0) {
  const MAX_TENTATIVES = 3;
  const DELAYS = [0, 30000, 120000]; // 0s, 30s, 2min

  try {
    return await envoyerDocsAuto(prospect, docs);
  } catch (err) {
    if (tentative < MAX_TENTATIVES - 1) {
      log('WARN', 'DOCS_AUTO', `Tentative ${tentative + 1} échouée: ${err.message} — retry dans ${DELAYS[tentative+1]/1000}s`);
      await sleep(DELAYS[tentative + 1]);
      return envoyerDocsAutoResilient(prospect, docs, tentative + 1);
    }
    // Échec définitif → alerte Telegram OBLIGATOIRE
    await alertShawnDocsFailed(prospect, err);
    throw err;
  }
}
```

---

### 4. Alerte Telegram si envoi docs échoue

**Problème:** Actuellement silence total si envoi plante.

**Fix:**

```javascript
async function alertShawnDocsFailed(prospect, err) {
  const msg = [
    `🚨 *DOCS NON ENVOYÉS*`,
    ``,
    `👤 Prospect: ${prospect.nom || prospect.email || 'Inconnu'}`,
    `📧 Email: ${prospect.email || '?'}`,
    `🏡 Terrain: ${prospect.adresse || prospect.centris || '?'}`,
    ``,
    `❌ Erreur: ${err.message}`,
    ``,
    `👆 Dis-moi "envoie les docs à [nom]" pour réessayer manuellement.`,
  ].join('\n');

  await sendTelegram(ALLOWED_ID, msg, { parse_mode: 'Markdown' });
}
```

---

### 5. Validation nom prospect avant création deal

**Règle:** Si nom = agent / générique / vide → ne PAS créer deal au nom de Shawn.

**Fix dans traiterNouveauLead():**

```javascript
// AVANT de créer deal:
if (!isValidProspectName(parsed.nom)) {
  // Notifier Shawn avec ce qu'on sait
  await sendTelegram(ALLOWED_ID, 
    `⚠️ *Lead reçu — nom non identifié*\n\n` +
    `📧 Email: ${parsed.email || '?'}\n` +
    `📞 Tél: ${parsed.telephone || '?'}\n` +
    `🏡 Centris: #${parsed.centris || '?'}\n` +
    `📍 Adresse: ${parsed.adresse || '?'}\n\n` +
    `Quel est le nom du prospect? (Réponds pour créer le deal)`,
    { parse_mode: 'Markdown' }
  );
  // Stocker en pending pour que Shawn complète manuellement
  pendingLeads.push({ ...parsed, needsName: true, ts: Date.now() });
  return; // NE PAS créer de deal incomplet
}
```

---

## 📋 ÉTAT D'IMPLÉMENTATION

| Fix | lead_parser.js | bot.js | Status |
|-----|---------------|--------|--------|
| Validation anti-faux-positifs | ✅ FAIT | ⚠️ Besoin patch | Partiel |
| Bcc invisible | N/A | ⚠️ Besoin patch | À faire |
| Retry envoi docs | N/A | ⚠️ Besoin patch | À faire |
| Alerte si échec | N/A | ⚠️ Besoin patch | À faire |
| Validation nom avant deal | ✅ FAIT | ⚠️ Besoin patch | Partiel |

---

## 🎯 POUR COMPLÉTER — Session Claude Code

Ouvrir `bot.js` sur Mac et appliquer:

1. **Rechercher** `envoyerDocsAuto(` → ajouter wrapper retry (section 3 ci-dessus)
2. **Rechercher** `cc: SHAWN_EMAIL` ou `Cc:` → remplacer par `Bcc:`
3. **Rechercher** `traiterNouveauLead` → ajouter validation nom (section 5 ci-dessus)
4. **Rechercher** `alertShawn` → ajouter `alertShawnDocsFailed` (section 4 ci-dessus)

Push → Render redéploie automatiquement (~2min).

---

## 🛡️ SYSTÈMES EN PLACE (déjà actifs)

| Système | Fichier | Status |
|---------|---------|--------|
| Circuit breaker par service | resilience.js | ✅ Actif |
| Retry backoff exponentiel | resilience.js | ✅ Actif |
| Heartbeat GitHub toutes 5min | resilience.js | ✅ Actif |
| Watchdog event loop | resilience.js | ✅ Actif |
| CRASH_REPORT auto GitHub | bot.js | ✅ Actif |
| Anti-doublons leads 7j (Gist) | bot.js | ✅ Actif |
| AI Haiku fallback parsing | lead_parser.js | ✅ Amélioré |
| Gmail Poller scan 5min | bot.js | ✅ Actif |
| Webhook Telegram auto-heal | bot.js | ✅ Actif |
| Token refresh Dropbox 3h | bot.js | ✅ Actif |
