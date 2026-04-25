# PATCH P5 — Activité "appel" automatique + Scraping Centris courtier

## Objectif
Après chaque nouveau lead traité:
1. Créer activité "appel" due le jour même dans Pipedrive
2. Scraper Centris courtier (compte 110509) pour récupérer les docs/photos du listing
3. Envoyer confirmation Telegram à Shawn

---

## Contexte Centris
- **Compte agent:** 110509
- **Password:** via env var CENTRIS_PASS
- **URL base:** https://www.centris.ca/
- **Login URL:** https://www.centris.ca/fr/login
- **Listing agent:** https://www.centris.ca/fr/propriete~[type]~[centris_id]
- **But:** Récupérer fiche complète (PDF, photos, description, specs) directement via session agent

---

## Code à ajouter dans bot.js

### 1. Après creerDeal() — Activité appel automatique

```javascript
// P5 — Activité appel auto le jour même
async function creerActiviteAppelAuto(dealId, prospectNom) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const heureNow = new Date();
    heureNow.setMinutes(heureNow.getMinutes() + 30);
    const heure = heureNow.toTimeString().slice(0, 5); // HH:MM

    await pipedrive.post('/activities', {
      subject: `📞 Appel J+0 — ${prospectNom}`,
      type: 'call',
      due_date: today,
      due_time: heure,
      deal_id: dealId,
      note: 'Appel suite à réception du lead — créé automatiquement par Kira'
    });

    console.log(`[P5] Activité appel créée pour ${prospectNom} — due ${today} à ${heure}`);
  } catch (err) {
    console.error('[P5] Erreur création activité:', err.message);
  }
}
```

### 2. Scraping Centris courtier (session authentifiée)

```javascript
// P5 — Scraper Centris avec compte agent 110509
const { chromium } = require('playwright'); // ou puppeteer si déjà installé

async function scrapeListingCentris(centrisId) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Login Centris
    await page.goto('https://www.centris.ca/fr/login');
    await page.fill('#username', process.env.CENTRIS_USER || '110509');
    await page.fill('#password', process.env.CENTRIS_PASS);
    await page.click('[type=submit]');
    await page.waitForNavigation();

    // Aller sur la fiche
    await page.goto(`https://www.centris.ca/fr/propriete~terrain~${centrisId}`);
    await page.waitForLoadState('networkidle');

    // Extraire données clés
    const data = await page.evaluate(() => ({
      titre: document.querySelector('h1')?.innerText,
      prix: document.querySelector('[data-price]')?.innerText,
      adresse: document.querySelector('.address')?.innerText,
      description: document.querySelector('.description')?.innerText,
      photos: [...document.querySelectorAll('.photo img')].map(img => img.src),
      specs: [...document.querySelectorAll('.specs li')].map(li => li.innerText)
    }));

    await browser.close();
    return data;

  } catch (err) {
    await browser.close();
    console.error('[P5] Erreur scrape Centris:', err.message);
    return null;
  }
}
```

### 3. Confirmation Telegram après envoi docs

```javascript
// P5 — Confirmation Telegram systématique
async function confirmerEnvoiDocs(prospect, email, centrisId, tempsMs) {
  const msg = [
    `✅ *Docs envoyés automatiquement*`,
    `👤 *${prospect}*`,
    `📧 ${email}`,
    `🏡 Centris #${centrisId}`,
    `⚡ ${tempsMs}ms après réception du lead`,
    `📞 Activité appel créée pour aujourd'hui`
  ].join('\n');

  await sendTelegram(msg, { parse_mode: 'Markdown' });
}
```

### 4. Intégration dans traiterNouveauLead()

Ajouter APRÈS envoyerDocsAutoResilient():

```javascript
// P5 — Après envoi docs
const tempsTotal = Date.now() - leadRecuAt;
await creerActiviteAppelAuto(dealResult.id, `${prenom} ${nom}`);
await confirmerEnvoiDocs(`${prenom} ${nom}`, email, centrisId, tempsTotal);
```

---

## Variables d'environnement requises

Déjà dans Render:
- `CENTRIS_USER=110509`
- `CENTRIS_PASS=***`

---

## Test

```bash
node -e "require('./bot.js'); scrapeListingCentris('28399427').then(console.log)"
```

---

## Notes importantes
- Centris peut bloquer les bots → utiliser des délais naturels (1-2s entre actions)
- Firecrawl peut aussi scraper Centris si Playwright trop lourd
- Priorité: Playwright si déjà installé, sinon Firecrawl API
- Cache les fiches 24h pour éviter les requêtes répétées
