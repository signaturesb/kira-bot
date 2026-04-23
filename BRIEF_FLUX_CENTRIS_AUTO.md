# BRIEF — FLUX CENTRIS AUTO 100% OPTIMAL

**Auteur:** Kira (bot Telegram Opus 4.7)
**Destinataire:** Claude Code (Mac de Shawn)
**Date:** 2026-04-23
**Statut:** Spec à implémenter — validation Shawn OBTENUE (choix Cc en attente)

---

## 🎯 OBJECTIF SHAWN

> "Quand une demande Centris rentre par courriel, le prospect reçoit les documents automatiquement et moi je suis en Cc. Configure ça pour que tous les problèmes techniques soient réglés et qu'on optimise ça parfaitement."

**Traduction technique:** Flux `Gmail → Pipedrive → Dropbox match → Email prospect + Cc Shawn` doit être 100% fiable, zéro intervention manuelle sur les leads clairs.

---

## 📊 ÉTAT ACTUEL (ce qui existe déjà dans bot.js)

### ✅ Pipeline fonctionnel end-to-end
1. **Gmail Poller** (cron 5min) — `detectLeadSource` + `isJunkLeadEmail` + `parseLeadEmail` + fallback `parseLeadEmailWithAI` (Haiku)
2. **Dédup 7j persistée Gist** — multi-clé (messageId + email + téléphone + nom+adresse)
3. **`traiterNouveauLead()`** — orchestrateur: Gmail → parse → match Dropbox → `creerDeal` Pipedrive → `envoyerDocsAuto`
4. **`matchDropboxAvance()`** — 4 stratégies: #Centris exact → adresse exacte → rue fuzzy → nom dossier fuzzy → score 0-100
5. **`creerDeal()`** Pipedrive — dédup smart (email → tel → nom fuzzy) + UPDATE auto si infos manquent
6. **`envoyerDocsAuto()`** avec 3 seuils:
   - **≥90%** → envoi automatique immédiat
   - **80-89%** → pending, attend "envoie" de Shawn par Telegram
   - **<80%** → brouillon seulement, Shawn valide tout
7. **Notification Telegram** à chaque étape (deal créé, docs envoyés/pending/brouillon)

### 🐛 BUGS IDENTIFIÉS (à fixer)

#### BUG #1 — Parsing HTML Centris a créé deal au nom "Shawn Barrette"
**Date:** 2026-04-23 00:15
**Lead:** Propriété 2850 Rue Stella, Rawdon (Centris #11041781)
**Cause probable:** Le HTML Centris contient parfois `De: Shawn Barrette <shawn@signaturesb.com>` dans le header réexpédié, et le regex capture le mauvais nom. Le vrai prospect est plus bas dans le corps.
**Résultat:** Deal créé avec mauvais nom → pas d'envoi auto (ou envoi à Shawn lui-même → boucle)
**À faire:**
- Dans `parseLeadEmail()`, **exclure** toute occurrence de `shawn@signaturesb.com`, `Shawn Barrette`, `Signature SB` dans les captures nom/email
- Prioriser le bloc "Coordonnées du client" ou "Informations de l'acheteur potentiel" du template Centris
- Si fallback Haiku → ajouter dans le prompt: "IGNORE toute mention de Shawn Barrette ou signaturesb.com — c'est le destinataire, pas le prospect"

#### BUG #2 — 5 PDFs prêts en Dropbox pour #11041781 jamais envoyés
**État:** Dossier `Rue_Stella_...` OU similaire à retrouver dans `/Terrain en ligne/`
**À faire:** Vérifier l'index Dropbox pour #11041781 — si match ≥90% aurait dû partir auto. Si le deal avait le bon nom, ça aurait marché.

---

## ⚙️ SPEC FINALE — ce qu'on implémente

### 1. PARSING CENTRIS DURCI (`parseLeadEmail` + `parseLeadEmailWithAI`)

```javascript
// Blacklist globale appliquée avant toute capture
const BLACKLIST_NAMES = ['shawn barrette', 'signature sb', 'remax', 're/max'];
const BLACKLIST_EMAILS = ['shawn@signaturesb.com', 'julie@signaturesb.com'];

function sanitizeProspect(data) {
  if (BLACKLIST_NAMES.some(b => (data.nom || '').toLowerCase().includes(b))) {
    data.nom = null; // Force fallback Haiku
  }
  if (BLACKLIST_EMAILS.includes((data.email || '').toLowerCase())) {
    data.email = null;
  }
  return data;
}
```

Appliquer après parseLeadEmail ET après parseLeadEmailWithAI.

### 2. CC AUTOMATIQUE SUR ENVOIS AUTO

**Modification `envoyerDocsAuto()` → ajouter Cc shawn@signaturesb.com sur TOUS les envois auto.**

Le tool `envoyer_docs_prospect` le fait déjà pour les envois manuels (Cc visible).
Il faut que le pipeline auto utilise le **même comportement**.

Déjà dans le code? À vérifier ligne par ligne — si le path auto bypasse le Cc, le corriger.

**Choix Cc de Shawn:** À CONFIRMER (A/B/C):
- **(A)** Cc visible shawn@ sur l'email client — client voit qu'on est copiés
- **(B)** Bcc invisible — client ne voit rien, Shawn reçoit copie
- **(C)** Pas de copie email, juste notification Telegram

**Défaut recommandé:** **(A) Cc visible** — ça rassure le client ("mon courtier est dans la boucle") et c'est déjà le comportement de `envoyer_docs_prospect`.

### 3. FALLBACK DE SÉCURITÉ — JAMAIS D'ENVOI SANS VALIDATION NOM

```javascript
// Dans envoyerDocsAuto(), AVANT l'envoi ≥90%:
if (!prospect.nom || prospect.nom.length < 3 || BLACKLIST_NAMES.some(b => prospect.nom.toLowerCase().includes(b))) {
  // Forcer passage en "pending" (attend Shawn) même si match ≥90%
  notifTelegram(`⚠️ Lead Centris détecté mais nom suspect: "${prospect.nom}". Validation requise avant envoi auto.`);
  return { status: 'pending_name_validation' };
}
```

### 4. LOGGING RENFORCÉ SUR FLUX CENTRIS

Chaque étape du flux auto → log structuré dans `LEADS_LOG.md` GitHub (append):
```
[2026-04-23 00:15:42] Lead #11041781
  Source: Centris
  Parse: ✅ (regex) | Nom: "Jean Tremblay" | Email: jean@... | Tel: 514-...
  Pipedrive: ✅ Deal #1234 créé
  Dropbox match: ✅ 95% — Rue_Stella_NoCentris_11041781
  Envoi: ✅ AUTO (5 PDFs, 2.3MB) à jean@... (Cc: shawn@)
  Durée totale: 4.2s
```

Permet à Shawn (et Claude Code) de **auditer chaque lead** a posteriori.

### 5. ALERTE TELEGRAM SYNTHÈSE

Quand un lead est traité AUTO réussi → message Telegram à Shawn:
```
🎯 LEAD AUTO ENVOYÉ
Jean Tremblay — 514-555-1234
Propriété: 2850 Stella Rawdon (#11041781)
Match Dropbox: 95% | 5 PDFs envoyés
Cc: shawn@ (toi) ✅
Deal Pipedrive: #1234
```

Quand PENDING (80-89%) → Telegram:
```
⏳ LEAD À VALIDER (match 85%)
Jean Tremblay — 514-555-1234
Dossier suggéré: Rue_Stella_NoCentris_11041781
Réponds "envoie" pour confirmer, ou "annule 1234" pour skip.
```

### 6. TESTS DE NON-RÉGRESSION

Créer `test_flux_centris.js` qui simule:
- ✅ Lead Centris clean → deal créé + envoi auto
- ✅ Lead avec "Shawn Barrette" dans header → forcé en pending
- ✅ Lead sans #Centris mais adresse claire → match Dropbox via fuzzy
- ✅ Lead doublon (même email dans 7j) → skip silencieux
- ✅ Lead avec match <80% → brouillon seulement

---

## 📋 CHECKLIST IMPLÉMENTATION (ordre)

- [ ] 1. Ajouter `BLACKLIST_NAMES` + `BLACKLIST_EMAILS` + `sanitizeProspect()` dans bot.js
- [ ] 2. Appliquer sanitize dans `parseLeadEmail` ET `parseLeadEmailWithAI`
- [ ] 3. Modifier prompt Haiku avec instruction "IGNORE Shawn Barrette"
- [ ] 4. Vérifier/forcer Cc shawn@ dans le path auto de `envoyerDocsAuto`
- [ ] 5. Ajouter garde "pending_name_validation" avant envoi ≥90%
- [ ] 6. Implémenter append `LEADS_LOG.md` à chaque étape
- [ ] 7. Améliorer message Telegram synthèse (format ci-dessus)
- [ ] 8. Créer `test_flux_centris.js` avec 5 scénarios
- [ ] 9. Push → deploy Render → tester avec un vrai lead Centris
- [ ] 10. Si OK 48h sans bug → marquer Phase 2.2 ROADMAP "✅ durcie"

---

## 🔒 RÈGLES NON-NÉGOCIABLES

1. **JAMAIS envoyer de doc auto si nom = Shawn/Julie/Signature SB** (même si score 100%)
2. **TOUJOURS Cc shawn@** sur les envois auto (visible, comportement confirmé)
3. **TOUJOURS logger** dans LEADS_LOG.md pour traçabilité
4. **JAMAIS force-push** sur `bot-assistant/main` (branche Render prod)
5. **Seuil ≥90%** reste pour l'envoi auto — ne pas baisser sans validation Shawn

---

## ❓ QUESTIONS OUVERTES POUR CLAUDE CODE

1. Le path auto dans `envoyerDocsAuto` passe-t-il bien par le même code que le tool manuel `envoyer_docs_prospect`? Si oui, le Cc shawn@ est déjà actif. Sinon, factoriser.
2. L'index Dropbox est-il régénéré assez souvent pour capter les nouveaux dossiers terrain (ex: nouveau listing ajouté le matin, lead arrive l'après-midi)?
3. Faut-il un **fallback "aucun match Dropbox"** qui envoie quand même un email générique "Bonjour, j'ai bien reçu votre demande, je vous reviens sous peu" pour maintenir l'engagement <5min?

**Kira attend les réponses de Shawn + tes propositions Claude Code avant d'ouvrir un PR.**

---

*Brief synchronisé Kira ↔ Claude Code via GitHub. Toute modif de ce fichier = update session partagée.*
