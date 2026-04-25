# PATCH P5 — Activité "appel" automatique le jour de réception du lead

**Priorité:** HAUTE — à ajouter après P1, P2, P3, P4
**Temps estimé:** 5 min
**Demande Shawn (2026-04-25):** "Le deal a pas été créé en activité à faire en date de la journée de la réception de la demande"

---

## OBJECTIF

Pour CHAQUE nouveau lead entrant via Gmail Poller, après `creerDeal()`, créer automatiquement une **activité Pipedrive de type "appel"** due **le jour même** (date de réception du lead, heure +30 min).

Évite la perte de leads par oubli de relance immédiate.

---

## CODE À AJOUTER

### Dans `bot.js` → fonction `traiterNouveauLead()`

**Localiser:** juste APRÈS la création réussie du deal (`creerDeal()` ou `tools.creer_deal()`)

**Ajouter ce bloc:**

```javascript
// ═══ P5: Activité appel automatique le jour même ═══
try {
  const maintenant = new Date();
  const dateActivite = maintenant.toISOString().split('T')[0]; // YYYY-MM-DD

  // Heure actuelle + 30 min, arrondi à la prochaine heure pile
  const heureFuture = new Date(maintenant.getTime() + 30 * 60 * 1000);
  const heureActivite = `${String(heureFuture.getHours()).padStart(2, '0')}:00`;

  await pipedriveRequest('POST', '/activities', {
    subject: `📞 Appeler nouveau lead: ${prenom} ${nom || ''}`.trim(),
    type: 'call',
    due_date: dateActivite,
    due_time: heureActivite,
    duration: '00:15',
    deal_id: dealId,
    person_id: personId || undefined,
    note: `Lead reçu via ${source || 'Centris'} à ${maintenant.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}. Docs envoyés automatiquement. Premier contact prioritaire.`
  });

  console.log(`[P5] ✅ Activité appel créée pour deal ${dealId} — ${dateActivite} ${heureActivite}`);

  // Confirmation Telegram à Shawn
  await sendTelegram(
    `📞 *Activité créée*\n` +
    `Appel ${prenom} ${nom || ''} prévu *aujourd'hui ${heureActivite}*\n` +
    `Deal Pipedrive: #${dealId}`
  );

} catch (errP5) {
  console.error('[P5] Erreur création activité:', errP5.message);
  // Non bloquant — le deal et les docs sont déjà OK
  await sendTelegram(`⚠️ Activité auto échouée pour ${prenom} — créer manuellement`);
}
```

---

## VALIDATION

Après push:
```bash
node validate.js
git add -A && git commit -m "[PATCH P5] Activité appel auto le jour même"
git push origin main
```

**Test:** envoyer un faux lead Centris → vérifier dans Pipedrive qu'une activité "appel" existe avec date du jour.

---

## CONFIRMATION TELEGRAM COMPLÈTE (workflow lead final)

Après tous les patches, Shawn reçoit pour CHAQUE lead:

```
🆕 Nouveau lead Centris
👤 [Prénom Nom]
📧 [email]
📱 [tel]
🏡 [type propriété]

✅ Deal Pipedrive créé #[id]
✅ Docs envoyés à [email]
✅ Activité appel prévue aujourd'hui [HH:00]
⏱️ Traitement total: [X] secondes
```

---

## NOTE STRATÉGIQUE

Ce patch est CRITIQUE — sans activité auto, les leads peuvent être oubliés malgré la
réception et l'envoi de docs. L'activité Pipedrive force la relance dans les 24h
(meilleure pratique RE/MAX: contact <5 min, relance <24h).

[2026-04-25 — Shawn Barrette, Signature SB]
