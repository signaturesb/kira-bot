# 🚨 BRIEF CLAUDE CODE — SYSTÈME ANTI-DOUBLONS ACTIVITÉS

**Date:** 2026-04-28
**Priorité:** ABSOLUE — bloque tout le reste
**Demandé par:** Shawn (3e fois — Lounes, Jeannot, maintenant Mathieu Courchesne)

---

## 🎯 PROBLÈME CONCRET

Quand un prospect envoie plusieurs emails Centris (demande info, demande visite, suivi), le bot crée une activité "appel" À CHAQUE EMAIL.

**Exemples réels:**
- **Lounes** → 20 activités appel en double
- **Jeannot Gagnon** → 20 activités appel en double
- **Mathieu Courchesne** → 10+ activités, certaines datées 2025-01-20 (résidu) + doublons 2026-04-13/14

**Cause racine:** Dans `traiterNouveauLead()` et tous les flows qui appellent `creerActivite()`, AUCUN check d'existant avant création.

---

## ✅ RÈGLE BUSINESS (dictée par Shawn)

> **Un lead entrant déclenche MAX 2 activités:**
> 1. **Appel J+0** (contact le jour même) — UNE SEULE, peu importe le nombre d'emails reçus
> 2. **Visite planifiée** (si le client demande une date) — UNE SEULE pour cette date
>
> **JAMAIS de doublon. JAMAIS.**

---

## 🛠️ SOLUTION À IMPLÉMENTER

### 1. Nouvelle fonction `dedupActivites(dealId, type, date)` dans `bot.js`

```javascript
/**
 * Vérifie si une activité du même type existe déjà pour ce deal à cette date.
 * Si oui → retourne l'ID existant (skip création).
 * Si non → retourne null (créer normalement).
 *
 * @param {number} dealId - ID du deal Pipedrive
 * @param {string} type - "call", "meeting", "task", etc.
 * @param {string} date - YYYY-MM-DD (optionnel, défaut: aujourd'hui)
 * @returns {Promise<number|null>} - ID activité existante OU null
 */
async function activiteExisteDeja(dealId, type, date = null) {
  const targetDate = date || new Date().toISOString().split('T')[0];

  const url = `https://api.pipedrive.com/v1/deals/${dealId}/activities?api_token=${PIPEDRIVE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.success || !data.data) return null;

  // Chercher activité non-complétée du même type à la même date
  const match = data.data.find(a =>
    a.type === type &&
    !a.done &&
    a.due_date === targetDate
  );

  return match ? match.id : null;
}
```

### 2. Nouvelle fonction `nettoyerDoublonsActivites(dealId)` dans `bot.js`

```javascript
/**
 * Nettoie les doublons d'activités pour un deal.
 * Garde la PLUS RÉCENTE de chaque (type, date) et supprime le reste.
 *
 * @param {number} dealId - ID du deal Pipedrive
 * @returns {Promise<{gardees: number, supprimees: number}>}
 */
async function nettoyerDoublonsActivites(dealId) {
  const url = `https://api.pipedrive.com/v1/deals/${dealId}/activities?api_token=${PIPEDRIVE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.success || !data.data) return { gardees: 0, supprimees: 0 };

  // Grouper par (type + due_date)
  const groupes = {};
  for (const act of data.data) {
    if (act.done) continue; // ignore les complétées
    const key = `${act.type}_${act.due_date}`;
    if (!groupes[key]) groupes[key] = [];
    groupes[key].push(act);
  }

  let gardees = 0, supprimees = 0;

  for (const key in groupes) {
    const groupe = groupes[key];
    if (groupe.length <= 1) {
      gardees++;
      continue;
    }

    // Trier par add_time DESC, garder la première
    groupe.sort((a, b) => new Date(b.add_time) - new Date(a.add_time));
    gardees++;

    // Supprimer les autres
    for (let i = 1; i < groupe.length; i++) {
      const delUrl = `https://api.pipedrive.com/v1/activities/${groupe[i].id}?api_token=${PIPEDRIVE_API_KEY}`;
      await fetch(delUrl, { method: 'DELETE' });
      supprimees++;
    }
  }

  return { gardees, supprimees };
}
```

### 3. PATCHER `creerActivite()` pour appeler `activiteExisteDeja()` AVANT

```javascript
async function creerActivite(dealId, type, sujet, dueDate, dueTime) {
  // 🛡️ ANTI-DOUBLON: check si activité du même type existe déjà à cette date
  const existant = await activiteExisteDeja(dealId, type, dueDate);
  if (existant) {
    console.log(`⏭️ Activité ${type} existe déjà pour deal ${dealId} le ${dueDate} (ID ${existant}) — skip`);
    return { skipped: true, existingId: existant };
  }

  // ... reste du code création normale
}
```

### 4. PATCHER `traiterNouveauLead()` pour nettoyer AVANT de créer

```javascript
async function traiterNouveauLead(...) {
  // ... création/match deal Pipedrive

  // 🧹 NOUVEAU: nettoyer doublons existants AVANT de créer nouvelle activité
  if (dealId) {
    const cleanup = await nettoyerDoublonsActivites(dealId);
    if (cleanup.supprimees > 0) {
      console.log(`🧹 Nettoyé ${cleanup.supprimees} doublons sur deal ${dealId}`);
    }
  }

  // ... création activité J+0 (qui appellera activiteExisteDeja en interne)
}
```

### 5. NOUVEAU CRON — Nettoyage hebdo dimanche 21h

```javascript
schedule.scheduleJob('0 21 * * 0', async () => {
  console.log('🧹 Nettoyage hebdo des doublons d\'activités...');

  // Récupérer tous les deals OUVERTS
  const url = `https://api.pipedrive.com/v1/deals?status=open&api_token=${PIPEDRIVE_API_KEY}&limit=500`;
  const res = await fetch(url);
  const data = await res.json();

  let totalSupprimees = 0;
  for (const deal of data.data || []) {
    const result = await nettoyerDoublonsActivites(deal.id);
    totalSupprimees += result.supprimees;
  }

  if (totalSupprimees > 0) {
    await sendTelegram(`🧹 Nettoyage hebdo: ${totalSupprimees} doublons supprimés sur ${data.data?.length || 0} deals`);
  }
});
```

### 6. NOUVELLE COMMANDE TELEGRAM `/dedup`

Permettre à Shawn de forcer un nettoyage manuel:

```javascript
// Dans le handler de messages Telegram
if (text === '/dedup') {
  await sendTelegram('🧹 Nettoyage en cours...');
  // Même logique que le cron hebdo
  // Retour: nb deals scannés + nb doublons supprimés
}
```

---

## 🧪 TESTS À FAIRE APRÈS DÉPLOIEMENT

1. **Test régression Lounes / Jeannot / Mathieu Courchesne:**
   - `node -e "require('./bot').nettoyerDoublonsActivites(LOUNES_DEAL_ID)"`
   - Vérifier dans Pipedrive: 1 seule activité par (type, date)

2. **Test création anti-doublon:**
   - Forcer 2x `traiterNouveauLead()` avec même prospect
   - Vérifier: 1 seule activité créée la 2e fois

3. **Test cron hebdo manuel:**
   - `/dedup` sur Telegram
   - Vérifier rapport retour

---

## 📊 IMPACT ATTENDU

- **Avant:** 20 doublons par prospect chaud (Lounes, Jeannot, Mathieu)
- **Après:** 1 activité unique par (type, date), même si 50 emails entrent
- **Bénéfice:** Pipeline propre, Shawn voit clair, plus jamais "20 activités fantômes"

---

## ⚠️ NE PAS OUBLIER

- Logger chaque skip pour debug (`console.log` clair)
- Logger chaque suppression dans audit log
- Tester sur 1 deal AVANT de lancer le cron sur tout le pipeline
- Le param `done` doit être respecté (ne JAMAIS toucher aux activités complétées)

---

**Estimation temps Claude Code:** 30-40 min implémentation + 10 min tests
**Fichiers touchés:** `bot.js` uniquement
**Aucune nouvelle dépendance npm**
