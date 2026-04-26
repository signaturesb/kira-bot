# 🛡️ PROTECTION SYSTEM — Prévenir plutôt que guérir
**Créé:** 2026-04-25  
**Objectif:** Zéro lead qui tombe dans les craques. Zéro deal stagnant sans alerte.  
**Philosophie:** Le bot détecte et agit AVANT que Shawn doive intervenir.

---

## 📋 RÉSUMÉ — 5 NIVEAUX À IMPLÉMENTER

| # | Niveau | Quoi | Fréquence |
|---|--------|------|-----------|
| N1 | Alerte J+1 | Lead entrant → appel créé + alerte si pas contacté | Immédiat + J+1 |
| N2 | Rapport matin | Résumé quotidien 8h30 → actions du jour | Quotidien 8h30 |
| N3 | Seuils stagnation | J+3/J+7/J+30 → email préparé / alerte rouge / nurture | Cron continu |
| N4 | Hygiene CRM | Doublons + deals sans valeur + étapes illogiques | Quotidien 9h |
| N5 | Digest hebdo | Dimanche 20h — semaine rétrospective + 3 priorités lundi | Dim. 20h |

---

## N1 — ALERTE J+1 (LEADS CHAUDS)

### Principe
Dès qu'un lead entre → activité "appel" créée pour le lendemain 9h.  
Si pas de contact après 24h → alerte Telegram rouge immédiate.

### Code à ajouter dans `traiterNouveauLead()` — APRÈS création deal Pipedrive

```javascript
// ─── N1: Alerte J+1 automatique ──────────────────────────────────────────────
async function planifierAlerteJ1(dealId, nom, email, telephone) {
  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  demain.setHours(9, 0, 0, 0);
  const demainISO = demain.toISOString().split('T')[0]; // YYYY-MM-DD

  // 1) Créer activité "appel" dans Pipedrive pour demain 9h
  try {
    await pipedrive.post('/activities', {
      subject: `📞 J+1 — Appeler ${nom}`,
      type: 'call',
      due_date: demainISO,
      due_time: '09:00',
      deal_id: dealId,
      note: `Lead entré ${new Date().toLocaleDateString('fr-CA')} — premier contact à faire`,
      done: 0,
    });
  } catch(e) {
    log('WARN', 'N1', `Activité J+1 non créée: ${e.message}`);
  }

  // 2) Planifier alerte Telegram si pas de contact dans 24h
  //    On stocke dans pending_alerts.json — vérifié par le cron N3
  const ALERTS_FILE = path.join(DATA_DIR, 'pending_alerts.json');
  let alerts = [];
  try {
    if (fs.existsSync(ALERTS_FILE)) {
      alerts = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
    }
  } catch(e) {}

  alerts.push({
    id: `j1_${dealId}_${Date.now()}`,
    type: 'J+1',
    dealId,
    nom,
    email: email || '',
    telephone: telephone || '',
    createdAt: Date.now(),
    alertAt: demain.getTime(), // timestamp exact d'alerte
    done: false,
  });

  fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2));
  log('INFO', 'N1', `Alerte J+1 planifiée pour ${nom} → ${demainISO} 9h`);
}
// ─── FIN N1 setup ─────────────────────────────────────────────────────────────
```

### Vérification J+1 dans le cron (voir N3 ci-dessous)
Le cron `checkAlertes()` tourne toutes les heures et évalue les alertes J+1 en retard.

---

## N2 — RAPPORT MATIN (8H30 QUOTIDIEN)

### Principe
Chaque matin à 8h30, Shawn reçoit un digest concis:
- Appels à faire aujourd'hui (activités Pipedrive due)
- Prospects en J+3 sans réponse
- Visites à confirmer
- Lead entré hier sans contact

### Code — ajouter dans le bloc des crons existants

```javascript
// ─── N2: Rapport matin 8h30 ───────────────────────────────────────────────────
// Trouver le bloc: schedule.scheduleJob('0 7 * * *', ...) ou similar
// Ajouter juste après:

schedule.scheduleJob('30 8 * * *', async () => {
  try {
    log('INFO', 'N2', 'Génération rapport matin...');
    await envoyerRapportMatin();
  } catch(e) {
    log('ERR', 'N2', `Rapport matin échoué: ${e.message}`);
  }
});

async function envoyerRapportMatin() {
  const aujourd = new Date().toISOString().split('T')[0];

  // 1) Activités Pipedrive dues aujourd'hui
  let activitesDues = [];
  try {
    const resp = await pipedrive.get(`/activities?due_date=${aujourd}&done=0&limit=20`);
    activitesDues = resp.data?.data || [];
  } catch(e) {}

  // 2) Deals sans activité depuis 3+ jours (via prospects_stagnants)
  let stagnants = [];
  try {
    const resp = await pipedrive.get('/deals?status=open&limit=100');
    const deals = resp.data?.data || [];
    const cutoff = Date.now() - (3 * 24 * 3600 * 1000);
    stagnants = deals.filter(d => {
      const lastActivity = new Date(d.last_activity_date || d.add_time).getTime();
      return lastActivity < cutoff;
    }).slice(0, 5); // top 5
  } catch(e) {}

  // 3) Alertes J+1 en retard
  const ALERTS_FILE = path.join(DATA_DIR, 'pending_alerts.json');
  let alertesRetard = [];
  try {
    if (fs.existsSync(ALERTS_FILE)) {
      const all = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
      const now = Date.now();
      alertesRetard = all.filter(a => !a.done && a.alertAt <= now && a.type === 'J+1');
    }
  } catch(e) {}

  // 4) Construire message
  const lines = [`☀️ *Bonjour Shawn — ${new Date().toLocaleDateString('fr-CA', {weekday:'long', day:'numeric', month:'long'})}*`, ``];

  if (activitesDues.length > 0) {
    lines.push(`📞 *${activitesDues.length} activité(s) aujourd'hui:*`);
    activitesDues.slice(0, 5).forEach(a => {
      lines.push(`  • ${a.subject} — ${a.deal_title || ''}`);
    });
    lines.push('');
  }

  if (alertesRetard.length > 0) {
    lines.push(`🔴 *${alertesRetard.length} lead(s) J+1 sans contact:*`);
    alertesRetard.forEach(a => {
      lines.push(`  • ${a.nom} — ${a.telephone || a.email || '?'}`);
    });
    lines.push('');
  }

  if (stagnants.length > 0) {
    lines.push(`⚠️ *Top ${stagnants.length} deals stagnants (3j+):*`);
    stagnants.forEach(d => {
      const jours = Math.floor((Date.now() - new Date(d.last_activity_date || d.add_time).getTime()) / 86400000);
      lines.push(`  • ${d.title} — ${jours}j sans action`);
    });
    lines.push('');
  }

  if (activitesDues.length === 0 && alertesRetard.length === 0 && stagnants.length === 0) {
    lines.push(`✅ Pipeline propre — aucune urgence ce matin.`);
    lines.push(`Continue comme ça! 🎯`);
  } else {
    lines.push(`👉 Dis-moi sur qui commencer et je prépare tout.`);
  }

  await sendTelegram(ALLOWED_ID, lines.join('\n'), { parse_mode: 'Markdown' });
  log('INFO', 'N2', 'Rapport matin envoyé ✅');
}
// ─── FIN N2 ────────────────────────────────────────────────────────────────────
```

---

## N3 — SEUILS DE STAGNATION (CRON TOUTES LES HEURES)

### Tableau des seuils

| Seuil | Étape concernée | Action automatique |
|-------|----------------|-------------------|
| **J+1** | Nouveau lead | Alerte Telegram rouge si pas contacté |
| **J+3** | Contacté/Discussion | Email relance préparé → attendre "envoie" |
| **J+7** | Discussion/Visite | Alerte rouge + "deal à risque" note Pipedrive |
| **J+30** | Visite faite/Offre | Propose transfert Brevo nurture |
| **J+100** | Tout | Auto-purge vers Brevo + marquer perdu |

### Code — cron de vérification

```javascript
// ─── N3: Seuils stagnation — cron horaire ─────────────────────────────────────
schedule.scheduleJob('0 * * * *', async () => {
  try {
    await checkAlertes();
    await checkSeuils();
  } catch(e) {
    log('ERR', 'N3', `Cron stagnation: ${e.message}`);
  }
});

// Vérifie les alertes J+1 en retard
async function checkAlertes() {
  const ALERTS_FILE = path.join(DATA_DIR, 'pending_alerts.json');
  if (!fs.existsSync(ALERTS_FILE)) return;

  let alerts = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8'));
  const now = Date.now();
  let modified = false;

  for (const alert of alerts) {
    if (alert.done || alert.alertAt > now) continue;

    if (alert.type === 'J+1') {
      // Vérifier si l'activité a été marquée "done" dans Pipedrive
      let contactFait = false;
      try {
        const resp = await pipedrive.get(`/activities?deal_id=${alert.dealId}&done=1&limit=5`);
        contactFait = (resp.data?.data?.length || 0) > 0;
      } catch(e) {}

      if (!contactFait) {
        // Alerte Telegram
        const msg = [
          `🔴 *J+1 — AUCUN CONTACT*`,
          ``,
          `👤 ${alert.nom}`,
          `📞 ${alert.telephone || '?'}`,
          `📧 ${alert.email || '?'}`,
          ``,
          `Lead entré il y a 24h — pas encore contacté.`,
          `Dis "relance ${alert.nom}" pour que je prépare le message.`,
        ].join('\n');
        await sendTelegram(ALLOWED_ID, msg, { parse_mode: 'Markdown' });
        alert.alertedAt = now;
        alert.done = true; // une seule alerte
        modified = true;
      } else {
        alert.done = true;
        modified = true;
      }
    }
  }

  if (modified) {
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts, null, 2));
  }
}

// Vérifie les deals par seuil de stagnation
async function checkSeuils() {
  let deals = [];
  try {
    const resp = await pipedrive.get('/deals?status=open&limit=200');
    deals = resp.data?.data || [];
  } catch(e) {
    log('ERR', 'N3', `Erreur fetch deals: ${e.message}`);
    return;
  }

  const now = Date.now();
  const SEUILS_FILE = path.join(DATA_DIR, 'seuils_alertes.json');
  let seuilsEnvoyes = {};
  try {
    if (fs.existsSync(SEUILS_FILE)) {
      seuilsEnvoyes = JSON.parse(fs.readFileSync(SEUILS_FILE, 'utf8'));
    }
  } catch(e) {}

  const alertes7j = [];
  const alertes30j = [];

  for (const deal of deals) {
    const lastActivity = new Date(deal.last_activity_date || deal.add_time).getTime();
    const jours = Math.floor((now - lastActivity) / 86400000);
    const stageId = deal.stage_id;
    const key7 = `7j_${deal.id}`;
    const key30 = `30j_${deal.id}`;

    // J+7 : étapes actives (discussion, visite prévue, visite faite)
    if (jours >= 7 && [51, 52, 53].includes(stageId) && !seuilsEnvoyes[key7]) {
      alertes7j.push({ nom: deal.title, jours, etape: stageId, id: deal.id });
      seuilsEnvoyes[key7] = now;
    }

    // J+30 : tout deal actif
    if (jours >= 30 && !seuilsEnvoyes[key30]) {
      alertes30j.push({ nom: deal.title, jours, id: deal.id });
      seuilsEnvoyes[key30] = now;
    }
  }

  // Envoyer alertes groupées (max 1 message par seuil)
  if (alertes7j.length > 0) {
    const lines = [`⚠️ *${alertes7j.length} deal(s) sans action depuis 7j+:*`, ``];
    alertes7j.forEach(d => lines.push(`• ${d.nom} — ${d.jours}j`));
    lines.push(``, `👉 Dis "relance [nom]" pour chaque prospect.`);
    await sendTelegram(ALLOWED_ID, lines.join('\n'), { parse_mode: 'Markdown' });
  }

  if (alertes30j.length > 0) {
    const lines = [`🟡 *${alertes30j.length} deal(s) inactifs 30j+ — nurture?*`, ``];
    alertes30j.slice(0, 5).forEach(d => lines.push(`• ${d.nom} — ${d.jours}j`));
    if (alertes30j.length > 5) lines.push(`  ... et ${alertes30j.length - 5} autres`);
    lines.push(``, `👉 "Transfère [nom] en nurture" pour les passer dans Brevo.`);
    await sendTelegram(ALLOWED_ID, lines.join('\n'), { parse_mode: 'Markdown' });
  }

  fs.writeFileSync(SEUILS_FILE, JSON.stringify(seuilsEnvoyes, null, 2));
}
// ─── FIN N3 ────────────────────────────────────────────────────────────────────
```

---

## N4 — HYGIENE CRM (QUOTIDIEN 9H)

### Détecte automatiquement

1. **Doublons** — même email ou téléphone dans 2 deals distincts
2. **Deals sans valeur $** — impossible de calculer ROI
3. **Étapes illogiques** — ex: "Visite faite" sans note depuis 7j+
4. **Séquence active sur deal perdu/gagné** — nettoyage auto

```javascript
// ─── N4: Hygiene CRM — quotidien 9h ──────────────────────────────────────────
schedule.scheduleJob('0 9 * * *', async () => {
  try {
    await hygieneQuotidienne();
  } catch(e) {
    log('ERR', 'N4', `Hygiene CRM: ${e.message}`);
  }
});

async function hygieneQuotidienne() {
  let deals = [];
  try {
    const resp = await pipedrive.get('/deals?status=open&limit=200');
    deals = resp.data?.data || [];
  } catch(e) { return; }

  const problemes = [];

  // Détection doublons email
  const emailMap = {};
  for (const deal of deals) {
    const email = deal.person_id?.email?.[0]?.value;
    if (!email) continue;
    if (emailMap[email]) {
      problemes.push(`🔸 Doublon email: "${emailMap[email]}" et "${deal.title}" (${email})`);
    } else {
      emailMap[email] = deal.title;
    }
  }

  // Deals sans valeur $
  const sansValeur = deals.filter(d => !d.value || d.value === 0).length;
  if (sansValeur > 0) {
    problemes.push(`💰 ${sansValeur} deal(s) sans valeur $ — impossible mesurer ROI`);
  }

  // Étapes illogiques: Visite faite >7j sans progression
  const visiteFaite7j = deals.filter(d => {
    if (d.stage_id !== 53) return false; // 53 = Visite faite
    const jours = Math.floor((Date.now() - new Date(d.last_activity_date || d.add_time).getTime()) / 86400000);
    return jours > 7;
  });
  if (visiteFaite7j.length > 0) {
    problemes.push(`🏡 ${visiteFaite7j.length} visite(s) faite(s) sans suivi depuis 7j+: ${visiteFaite7j.map(d => d.title).join(', ')}`);
  }

  // Rapport uniquement si problèmes trouvés
  if (problemes.length > 0) {
    const msg = [
      `🔧 *Hygiene CRM — ${new Date().toLocaleDateString('fr-CA')}*`,
      ``,
      ...problemes,
      ``,
      `👉 Veux-tu que je corrige automatiquement?`,
    ].join('\n');
    await sendTelegram(ALLOWED_ID, msg, { parse_mode: 'Markdown' });
    log('INFO', 'N4', `${problemes.length} problème(s) CRM détecté(s)`);
  } else {
    log('INFO', 'N4', 'Pipeline propre ✅');
  }
}
// ─── FIN N4 ────────────────────────────────────────────────────────────────────
```

---

## N5 — DIGEST HEBDOMADAIRE (DIMANCHE 20H)

### Principe
Chaque dimanche soir → résumé de la semaine + 3 priorités pour lundi matin.

```javascript
// ─── N5: Digest hebdo dimanche 20h ────────────────────────────────────────────
schedule.scheduleJob('0 20 * * 0', async () => {
  try {
    await digestHebdo();
  } catch(e) {
    log('ERR', 'N5', `Digest hebdo: ${e.message}`);
  }
});

async function digestHebdo() {
  const now = Date.now();
  const uneSemaine = now - (7 * 24 * 3600 * 1000);

  let deals = [];
  try {
    const resp = await pipedrive.get('/deals?status=open&limit=200');
    deals = resp.data?.data || [];
  } catch(e) {}

  let gagnés = [];
  try {
    const resp = await pipedrive.get(`/deals?status=won&limit=50`);
    gagnés = (resp.data?.data || []).filter(d =>
      new Date(d.close_time || d.won_time).getTime() > uneSemaine
    );
  } catch(e) {}

  let perdus = [];
  try {
    const resp = await pipedrive.get(`/deals?status=lost&limit=50`);
    perdus = (resp.data?.data || []).filter(d =>
      new Date(d.close_time || d.lost_time).getTime() > uneSemaine
    );
  } catch(e) {}

  // Top 3 priorités lundi = deals les plus avancés sans action récente
  const priorités = deals
    .filter(d => [51, 52, 53].includes(d.stage_id)) // Discussion, Visite prévue, Visite faite
    .sort((a, b) => b.stage_id - a.stage_id) // plus avancé en premier
    .slice(0, 3);

  const lines = [
    `📊 *Semaine du ${new Date(uneSemaine).toLocaleDateString('fr-CA')} au ${new Date().toLocaleDateString('fr-CA')}*`,
    ``,
    `✅ Deals gagnés: ${gagnés.length}${gagnés.length > 0 ? ' — ' + gagnés.map(d => d.title).join(', ') : ''}`,
    `❌ Deals perdus: ${perdus.length}`,
    `📋 Pipeline actif: ${deals.length} deals ouverts`,
    ``,
    `🎯 *3 priorités pour lundi:*`,
    ...priorités.map((d, i) => {
      const jours = Math.floor((now - new Date(d.last_activity_date || d.add_time).getTime()) / 86400000);
      const etapeNom = {51:'Discussion',52:'Visite prévue',53:'Visite faite'}[d.stage_id] || '';
      return `${i + 1}. ${d.title} — ${etapeNom} (${jours}j sans action)`;
    }),
    ``,
    `Bonne semaine! 💪`,
  ];

  await sendTelegram(ALLOWED_ID, lines.join('\n'), { parse_mode: 'Markdown' });
  log('INFO', 'N5', 'Digest hebdo envoyé ✅');
}
// ─── FIN N5 ────────────────────────────────────────────────────────────────────
```

---

## 🔧 ORDRE D'IMPLÉMENTATION DANS BOT.JS

### Étape 1 — DATA_DIR: vérifier les fichiers persistants (boot)
```javascript
// Au boot (après DATA_DIR défini), initialiser les fichiers JSON si absents:
const ALERTS_FILE = path.join(DATA_DIR, 'pending_alerts.json');
const SEUILS_FILE = path.join(DATA_DIR, 'seuils_alertes.json');

if (!fs.existsSync(ALERTS_FILE)) fs.writeFileSync(ALERTS_FILE, '[]');
if (!fs.existsSync(SEUILS_FILE)) fs.writeFileSync(SEUILS_FILE, '{}');
```

### Étape 2 — Ajouter les 5 fonctions
Ajouter dans cet ordre, AVANT le bloc des crons existants:
1. `planifierAlerteJ1()` ← appelée par `traiterNouveauLead()`
2. `envoyerRapportMatin()`
3. `checkAlertes()` + `checkSeuils()`
4. `hygieneQuotidienne()`
5. `digestHebdo()`

### Étape 3 — Appeler `planifierAlerteJ1()` dans `traiterNouveauLead()`
```javascript
// APRÈS création deal Pipedrive (après que dealId est connu):
if (dealId && parsed.nom) {
  await planifierAlerteJ1(dealId, parsed.nom, parsed.email, parsed.telephone).catch(e =>
    log('WARN', 'N1', `planifierAlerteJ1 non-bloquant: ${e.message}`)
  );
}
```

### Étape 4 — Ajouter les 4 crons
```javascript
// Dans le bloc des crons (chercher: schedule.scheduleJob):
// Ajouter APRÈS les crons existants:
schedule.scheduleJob('30 8 * * *', async () => { try { await envoyerRapportMatin(); } catch(e) { log('ERR','N2',e.message); } });
schedule.scheduleJob('0 * * * *',  async () => { try { await checkAlertes(); await checkSeuils(); } catch(e) { log('ERR','N3',e.message); } });
schedule.scheduleJob('0 9 * * *',  async () => { try { await hygieneQuotidienne(); } catch(e) { log('ERR','N4',e.message); } });
schedule.scheduleJob('0 20 * * 0', async () => { try { await digestHebdo(); } catch(e) { log('ERR','N5',e.message); } });
```

### Étape 5 — Dépendance: `node-schedule`
Vérifier que `node-schedule` est déjà dans les imports. C'est probablement:
```javascript
const schedule = require('node-schedule');
```
Si absent: `npm install node-schedule` + ajouter dans package.json.

### Étape 6 — Valider et déployer
```bash
node validate.js
git add -A && git commit -m "feat: PROTECTION_SYSTEM — 5 niveaux prévention"
git push origin main
# Attendre 90s
curl https://signaturesb-bot-s272.onrender.com/health
```

---

## 📁 FICHIERS CRÉÉS (persistants dans /data/)

| Fichier | Usage |
|---------|-------|
| `pending_alerts.json` | Alertes J+1 à surveiller |
| `seuils_alertes.json` | Tracker pour éviter doublons alertes J+7/J+30 |
| `pending_leads.json` | Leads en attente de nom (PATCH P1) |

---

## ✅ RÉSULTAT FINAL — CE QUE ÇA DONNE

```
Nouveau lead (9h15) 
  → Deal créé Pipedrive + docs envoyés <10s (déjà actif ✅)
  → Activité "appel" créée demain 9h (N1 ✅)
  
Lendemain 9h (si pas appelé)
  → 🔴 Alerte Telegram: "Nom — 24h sans contact" (N1 ✅)
  
Chaque matin 8h30
  → ☀️ Rapport: activités du jour + stagnants + J+1 retard (N2 ✅)
  
Chaque heure
  → Scan silencieux J+7 / J+30 → alerte si nouveau (N3 ✅)
  
Chaque matin 9h
  → Hygiene CRM: doublons + sans valeur $ + étapes illogiques (N4 ✅)
  
Dimanche 20h
  → 📊 Résumé semaine + 3 priorités lundi (N5 ✅)
```

**Zéro lead qui tombe dans les craques. Zéro deal stagnant sans alerte.  
Le bot prévient avant que ça arrive — toujours.**
