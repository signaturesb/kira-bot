# 🗺️ ZONAGE PDF → TELEGRAM → EMAIL — Workflow Shawn

**Demande (2026-05-14):** Scraper intelligent zonage municipal → grille PDF dans Telegram → Shawn envoie par email au client avec lui en Cc.

---

## 🎯 WORKFLOW COMPLET

```
Shawn: "zonage rue Aumont Saint-Calixte"
  ↓
1. Bot identifie ville → Saint-Calixte
2. Bot scrape saint-calixte.ca/urbanisme/ via Firecrawl
3. Bot trouve la zone de la rue (ex: R-2 résidentiel mixte)
4. Bot extrait grille d'usage: usages permis, marges, hauteur max, superficie min
5. Bot génère PDF propre (format A4, logo Signature SB)
6. Bot envoie PDF dans Telegram à Shawn
7. Shawn: "envoie à client@email.com"
8. Bot: envoie email au client avec PDF joint, Shawn en Cc visible

```

---

## 🔑 PRÉ-REQUIS (à faire UNE FOIS)

### 1. FIRECRAWL_API_KEY dans Render

```
FIRECRAWL_API_KEY=fc-52e378f6759746e4807406ddc3517d07
FIRECRAWL_QUOTA_MONTHLY=500
```

Ajouter via Render Dashboard → signaturesb-bot-s272 → Environment → Add Variable

### 2. Librairie PDF (déjà dans package.json?)

```bash
npm install pdfkit
```

Ajouter dans package.json dependencies si absent.

---

## 🏗️ IMPLÉMENTATION DANS bot.js

### ÉTAPE 1 — Import en haut de bot.js

```javascript
const firecrawl = require('./firecrawl_scraper');
let PDFDocument;
try { PDFDocument = require('pdfkit'); } catch { PDFDocument = null; }
```

### ÉTAPE 2 — Fonction `analyserZonageRue(adresse, ville)`

```javascript
/**
 * Analyse le zonage d'une rue/adresse dans une ville Lanaudière.
 * Retourne: { zone, usages, marges, hauteur, superficieMin, source, telephone }
 */
async function analyserZonageRue(adresse, ville) {
  const { scrapeVille, extractZone } = require('./firecrawl_scraper');
  
  // 1. Scraper le site municipal
  let result;
  try {
    result = await scrapeVille(ville, 'zonage');
  } catch (e) {
    return { 
      erreur: `Scraping échoué: ${e.message}`,
      fallback: true,
      telephone: MUNICIPALITES[ville]?.telephone || 'Appeler la municipalité'
    };
  }

  // 2. Chercher la zone de la rue dans le markdown
  const markdown = result.markdown || '';
  const zone = extractZoneFromRue(markdown, adresse);
  
  // 3. Extraire grille d'usage de cette zone
  const grille = extractGrilleZone(markdown, zone);
  
  return {
    ville,
    adresse,
    zone: zone || 'Non identifiée',
    grille,
    source: result._cached ? 'Cache 30j' : 'Live',
    url: result.url,
    telephone: MUNICIPALITES_TEL[ville] || '450-xxx-xxxx'
  };
}

/**
 * Cherche la zone correspondant à une rue dans le markdown du règlement
 */
function extractZoneFromRue(markdown, adresse) {
  const rue = adresse.toLowerCase().replace(/[0-9]+/g, '').trim();
  const lignes = markdown.split('\n');
  
  // Chercher ligne mentionnant la rue
  for (let i = 0; i < lignes.length; i++) {
    if (lignes[i].toLowerCase().includes(rue)) {
      // Chercher la zone dans les lignes proches
      const context = lignes.slice(Math.max(0, i-3), i+5).join(' ');
      const zoneMatch = context.match(/\b([A-Z]{1,3}-\d{1,3}(?:\.\d)?)\b/);
      if (zoneMatch) return zoneMatch[1];
    }
  }
  return null;
}

/**
 * Extrait la grille d'usage d'une zone du markdown
 */
function extractGrilleZone(markdown, zone) {
  if (!zone) return null;
  const lignes = markdown.split('\n');
  const grille = {
    zone,
    usages_permis: [],
    marge_avant: null,
    marge_arriere: null,
    marge_laterale: null,
    hauteur_max: null,
    superficie_min: null,
    notes: []
  };

  let inZone = false;
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    
    // Détecter entrée dans la section de cette zone
    if (ligne.includes(zone)) inZone = true;
    if (!inZone) continue;
    
    // Extraire valeurs
    if (/marge avant/i.test(ligne)) {
      const m = ligne.match(/(\d+[\.,]?\d*)\s*m/);
      if (m) grille.marge_avant = m[1] + ' m';
    }
    if (/marge (arrière|arriere)/i.test(ligne)) {
      const m = ligne.match(/(\d+[\.,]?\d*)\s*m/);
      if (m) grille.marge_arriere = m[1] + ' m';
    }
    if (/marge (latérale|laterale)/i.test(ligne)) {
      const m = ligne.match(/(\d+[\.,]?\d*)\s*m/);
      if (m) grille.marge_laterale = m[1] + ' m';
    }
    if (/hauteur (max|maximale)/i.test(ligne)) {
      const m = ligne.match(/(\d+[\.,]?\d*)\s*m/);
      if (m) grille.hauteur_max = m[1] + ' m';
    }
    if (/superficie (min|minimale)/i.test(ligne)) {
      const m = ligne.match(/(\d+[\s,.]?\d*)\s*m[²2]/);
      if (m) grille.superficie_min = m[0].trim();
    }
    
    // Usages permis (lignes avec ✓ ou "permis" ou "autorisé")
    if (/[✓✅]|permis|autorisé/i.test(ligne) && ligne.length < 100) {
      grille.usages_permis.push(ligne.replace(/[✓✅\-\*]/g, '').trim());
    }
    
    // Arrêter si on arrive à la prochaine zone
    if (inZone && i > 5 && /\b[A-Z]{1,3}-\d{1,3}\b/.test(ligne) && !ligne.includes(zone)) {
      break;
    }
  }
  
  return grille;
}
```

### ÉTAPE 3 — Fonction `genererPDFZonage(grille)` → Buffer

```javascript
/**
 * Génère un PDF de la grille de zonage.
 * Retourne un Buffer PDF ou null si PDFKit absent.
 */
async function genererPDFZonage(data) {
  if (!PDFDocument) {
    // Fallback: texte formaté → image via Telegram
    return null;
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ 
      size: 'LETTER', 
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ─── HEADER ───
    doc.rect(0, 0, 612, 80).fill('#0a0a0a');
    doc.fillColor('#aa0721').fontSize(20).font('Helvetica-Bold')
       .text('SIGNATURE SB', 50, 20);
    doc.fillColor('#f5f5f7').fontSize(11).font('Helvetica')
       .text('GRILLE DE ZONAGE MUNICIPAL', 50, 45);
    doc.fillColor('#888').fontSize(9)
       .text(`Généré le ${new Date().toLocaleDateString('fr-CA')} · ${data.ville}`, 50, 60);
    
    // ─── ZONE IDENTIFIÉE ───
    doc.fillColor('#aa0721').fontSize(16).font('Helvetica-Bold')
       .text(`Zone: ${data.grille?.zone || 'N/D'}`, 50, 100);
    doc.fillColor('#333').fontSize(11).font('Helvetica')
       .text(`Adresse: ${data.adresse}`, 50, 122)
       .text(`Municipalité: ${data.ville}`, 50, 137);
    
    // ─── TABLEAU SPÉCIFICATIONS ───
    doc.moveDown(2);
    const y0 = 170;
    const col1 = 50, col2 = 320;
    const rowH = 28;
    
    const specs = [
      ['Marge avant',    data.grille?.marge_avant     || 'Voir règlement'],
      ['Marge arrière',  data.grille?.marge_arriere   || 'Voir règlement'],
      ['Marge latérale', data.grille?.marge_laterale  || 'Voir règlement'],
      ['Hauteur maximale', data.grille?.hauteur_max   || 'Voir règlement'],
      ['Superficie min. lot', data.grille?.superficie_min || 'Voir règlement'],
    ];

    // Header tableau
    doc.rect(col1, y0, 510, rowH).fill('#0a0a0a');
    doc.fillColor('#f5f5f7').fontSize(10).font('Helvetica-Bold')
       .text('SPÉCIFICATION', col1+8, y0+8)
       .text('VALEUR', col2+8, y0+8);

    specs.forEach(([label, val], i) => {
      const y = y0 + rowH + (i * rowH);
      const bg = i % 2 === 0 ? '#f9f9f9' : '#ffffff';
      doc.rect(col1, y, 510, rowH).fill(bg).stroke('#e0e0e0');
      doc.fillColor('#333').fontSize(10).font('Helvetica')
         .text(label, col1+8, y+8)
         .text(val, col2+8, y+8);
    });

    // ─── USAGES PERMIS ───
    const yUsages = y0 + rowH + (specs.length * rowH) + 30;
    doc.fillColor('#0a0a0a').fontSize(12).font('Helvetica-Bold')
       .text('USAGES PERMIS', col1, yUsages);
    
    const usages = data.grille?.usages_permis || [];
    if (usages.length === 0) {
      doc.fillColor('#666').fontSize(10).font('Helvetica')
         .text('Consulter le règlement de zonage complet de la municipalité.', col1, yUsages+20);
    } else {
      usages.slice(0, 8).forEach((u, i) => {
        doc.fillColor('#333').fontSize(10).font('Helvetica')
           .text(`• ${u}`, col1, yUsages + 20 + (i * 16));
      });
    }

    // ─── NOTE TRIPLEX ─── (si question posée)
    if (data.questionTriplex) {
      const yNote = yUsages + 20 + (Math.max(usages.length, 1) * 16) + 20;
      doc.rect(col1, yNote, 510, 50).fill('#fff8e1').stroke('#f0c040');
      doc.fillColor('#7a5c00').fontSize(10).font('Helvetica-Bold')
         .text('ℹ️  NOTE TRIPLEX', col1+8, yNote+8);
      doc.font('Helvetica').fontSize(9)
         .text(data.noteTriplex || 'Vérifier si zone autorise usage multiple (triplex/plex).', col1+8, yNote+22, { width: 494 });
    }

    // ─── FOOTER ───
    doc.rect(0, 740, 612, 60).fill('#0a0a0a');
    doc.fillColor('#888').fontSize(8).font('Helvetica')
       .text('Source: Site municipal officiel · Cache 30 jours · À valider avec la municipalité avant tout projet', 50, 752)
       .text(`${data.telephone || ''} · shawn@signaturesb.com · 514-927-1340`, 50, 764);
    doc.fillColor('#aa0721').fontSize(8)
       .text('SIGNATURE SB | RE/MAX PRESTIGE', 50, 776);

    doc.end();
  });
}
```

### ÉTAPE 4 — Fonction `envoyerZonageTelegram(data, chatId)` 

```javascript
/**
 * Envoie la grille de zonage en PDF dans Telegram.
 * Si PDFKit absent → envoie message texte formaté.
 * Sauvegarde le PDF en /data/last_zonage.pdf pour envoi email ultérieur.
 */
async function envoyerZonageTelegram(data, chatId) {
  const pdfBuffer = await genererPDFZonage(data);
  
  if (pdfBuffer) {
    // Sauvegarder pour envoi email ultérieur
    const pdfPath = path.join(DATA_DIR, 'last_zonage.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);
    
    // Sauvegarder contexte pour envoi email
    fs.writeFileSync(
      path.join(DATA_DIR, 'last_zonage_context.json'),
      JSON.stringify({
        adresse: data.adresse,
        ville: data.ville,
        zone: data.grille?.zone,
        timestamp: Date.now()
      })
    );
    
    // Envoyer PDF dans Telegram
    await bot.sendDocument(chatId, pdfBuffer, {}, {
      filename: `zonage_${data.ville.replace(/\s/g,'_')}_${data.grille?.zone || 'grille'}.pdf`,
      contentType: 'application/pdf'
    });
    
    await bot.sendMessage(chatId, 
      `📋 *Zone ${data.grille?.zone || 'N/D'}* — ${data.adresse}\n` +
      `📐 Marge avant: ${data.grille?.marge_avant || 'N/D'} | Latérale: ${data.grille?.marge_laterale || 'N/D'} | Arrière: ${data.grille?.marge_arriere || 'N/D'}\n` +
      `🏗️ Hauteur max: ${data.grille?.hauteur_max || 'N/D'} | Lot min: ${data.grille?.superficie_min || 'N/D'}\n\n` +
      `💬 Dis-moi "envoie à client@email.com" pour transférer au client avec toi en Cc.`,
      { parse_mode: 'Markdown' }
    );
  } else {
    // Fallback texte si PDFKit absent
    const grille = data.grille || {};
    const msg = [
      `🗺️ *Zonage ${data.adresse} — ${data.ville}*`,
      ``,
      `📌 Zone identifiée: *${grille.zone || 'N/D'}*`,
      ``,
      `📐 *Spécifications:*`,
      `• Marge avant: ${grille.marge_avant || 'N/D'}`,
      `• Marge arrière: ${grille.marge_arriere || 'N/D'}`,
      `• Marge latérale: ${grille.marge_laterale || 'N/D'}`,
      `• Hauteur max: ${grille.hauteur_max || 'N/D'}`,
      `• Superficie min lot: ${grille.superficie_min || 'N/D'}`,
      ``,
      `⚠️ _PDF indisponible (pdfkit manquant) — installer avec: npm install pdfkit_`,
      ``,
      `💬 Source: ${data.source || 'live'} | ${data.telephone || ''}`
    ].join('\n');
    
    await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }
}
```

### ÉTAPE 5 — Fonction `envoyerZonageEmail(emailClient, chatId)`

```javascript
/**
 * Envoie le dernier PDF de zonage par email au client.
 * Shawn est automatiquement en Cc.
 */
async function envoyerZonageEmail(emailClient, chatId) {
  const pdfPath = path.join(DATA_DIR, 'last_zonage.pdf');
  const contextPath = path.join(DATA_DIR, 'last_zonage_context.json');
  
  if (!fs.existsSync(pdfPath)) {
    await bot.sendMessage(chatId, '❌ Aucun PDF de zonage disponible. Génère-en un d\'abord.');
    return;
  }
  
  let ctx = {};
  try { ctx = JSON.parse(fs.readFileSync(contextPath, 'utf8')); } catch {}
  
  const pdfBuffer = fs.readFileSync(pdfPath);
  const sujet = `Grille de zonage — ${ctx.adresse || 'propriété'} (Zone ${ctx.zone || 'N/D'})`;
  const corps = `Bonjour,\n\nVeuillez trouver ci-joint la grille de zonage pour la propriété située au ${ctx.adresse || ''} à ${ctx.ville || ''} (Zone ${ctx.zone || 'N/D'}).\n\nN'hésitez pas si vous avez des questions.\n\nAu plaisir,\nShawn Barrette\n514-927-1340\nshawn@signaturesb.com`;
  
  // Envoyer via Gmail avec PDF joint
  await envoyerEmailAvecPJ({
    to: emailClient,
    cc: SHAWN_EMAIL,
    sujet,
    corps,
    pj: [{
      filename: `zonage_${(ctx.adresse||'').replace(/[^a-z0-9]/gi,'_')}.pdf`,
      buffer: pdfBuffer,
      contentType: 'application/pdf'
    }]
  });
  
  await bot.sendMessage(chatId,
    `✅ Grille de zonage envoyée à ${emailClient}\n` +
    `📧 Toi en Cc: ${SHAWN_EMAIL}\n` +
    `📋 Zone ${ctx.zone || 'N/D'} — ${ctx.adresse || ''}`
  );
}
```

### ÉTAPE 6 — Détecter "envoie à [email]" dans le handler Telegram

```javascript
// Dans le handler de messages Telegram (après les commandes /xxx)
// Détecter pattern: "envoie à email@domain.com" ou "envoie le zonage à email@"

const emailMatch = texte.match(/envoie[- ]?(le zonage)?[- ]?à\s+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
if (emailMatch) {
  const emailClient = emailMatch[2];
  const pdfPath = path.join(DATA_DIR, 'last_zonage.pdf');
  
  if (fs.existsSync(pdfPath)) {
    await envoyerZonageEmail(emailClient, chatId);
    return; // géré ici, pas par Claude
  }
}
```

---

## 🔄 GESTION TRIPLEX (question initiale de Shawn)

```javascript
// Quand Shawn demande "possible triplex rue X ville Y"
// 1. analyserZonageRue(rue, ville)
// 2. Vérifier si zone permet usage plex/triplex:
//    - Zone R-2: généralement bifamiliaux
//    - Zone R-3: trifamiliaux et plus ✅
//    - Zone M (mixte): souvent plex ✅
//    - Zone R-1: généralement unifamilial seulement ❌
// 3. Répondre avec zone + usage triplex permis/non-permis
// 4. Générer PDF avec note triplex

function verifierTriplex(grille) {
  const zone = (grille?.zone || '').toUpperCase();
  const usages = (grille?.usages_permis || []).join(' ').toLowerCase();
  
  if (zone.includes('R-3') || zone.includes('R3') || 
      usages.includes('triplex') || usages.includes('trifamilial') ||
      usages.includes('3 logements') || zone.includes('M-')) {
    return { permis: true, note: `Zone ${zone} permet généralement les triplex ✅` };
  }
  if (zone.includes('R-2') || zone.includes('R2')) {
    return { permis: null, note: `Zone ${zone}: bifamilial standard — vérifier règlement complet pour triplex` };
  }
  if (zone.includes('R-1') || zone.includes('R1')) {
    return { permis: false, note: `Zone ${zone}: résidentiel unifamilial — triplex probablement non permis ❌` };
  }
  return { permis: null, note: `Zone ${zone}: vérifier règlement complet municipalité` };
}
```

---

## 📦 DÉPENDANCES À AJOUTER

```json
// package.json — ajouter dans dependencies:
"pdfkit": "^0.15.0"
```

---

## ✅ CHECKLIST DÉPLOIEMENT

- [ ] `FIRECRAWL_API_KEY=fc-52e378f6759746e4807406ddc3517d07` dans Render
- [ ] `FIRECRAWL_QUOTA_MONTHLY=500` dans Render  
- [ ] `npm install pdfkit` → `package.json` mis à jour
- [ ] `firecrawl_scraper.js` déjà présent ✅
- [ ] Fonctions ajoutées dans `bot.js`: `analyserZonageRue`, `genererPDFZonage`, `envoyerZonageTelegram`, `envoyerZonageEmail`
- [ ] Détection "envoie à email@" dans handler Telegram
- [ ] `node validate.js` + push + 90s Render

---

*Créé: 2026-05-14 par Kira pour Claude Code*
