# 🚀 SESSION CLAUDE CODE — 13 MAI 2026
# Mission: Flux Centris Auto + Docs + Firecrawl Zonage

**Auteur:** Kira (bot Telegram)
**Destinataire:** Claude Code (Mac de Shawn)
**Statut:** PRÊT À EXÉCUTER — aucune question à poser à Shawn

---

## 🎯 OBJECTIF SESSION

Implémenter 3 blocs en séquence:

1. **BLOC A** — Flux Centris auto durci (BRIEF_FLUX_CENTRIS_AUTO.md)
2. **BLOC B** — Téléchargement docs Centris complet (DV + fiche + annexes)
3. **BLOC C** — Firecrawl zonage branché dans bot.js

---

## ⚡ AVANT DE COMMENCER

Lire dans l'ordre:
1. `INSTRUCTIONS_CLAUDE_CODE.md` — règles absolues
2. `BRIEF_FLUX_CENTRIS_AUTO.md` — spec flux auto
3. `FIRECRAWL_PROMPT_CLAUDE_CODE.md` — spec Firecrawl
4. `bot.js` — code actuel

---

## 📋 BLOC A — FLUX CENTRIS AUTO DURCI

### A1. Blacklist parsing (dans `parseLeadEmail` ET `parseLeadEmailWithAI`)

```javascript
const BLACKLIST_NAMES = ['shawn barrette', 'signature sb', 'remax', 're/max', 'julie'];
const BLACKLIST_EMAILS = ['shawn@signaturesb.com', 'julie@signaturesb.com'];

function sanitizeProspect(data) {
  if (BLACKLIST_NAMES.some(b => (data.nom || '').toLowerCase().includes(b))) {
    data.nom = null;
  }
  if (BLACKLIST_EMAILS.includes((data.email || '').toLowerCase())) {
    data.email = null;
  }
  return data;
}
```

Appliquer `sanitizeProspect()` après CHAQUE parse (regex ET Haiku).

### A2. Prompt Haiku — ajouter cette instruction:
```
IMPORTANT: IGNORE toute mention de "Shawn Barrette", "shawn@signaturesb.com", 
"Signature SB", "RE/MAX", "Julie" — ce sont les informations du courtier, 
PAS du prospect. Extraire UNIQUEMENT les coordonnées du client/acheteur.
```

### A3. Garde sécurité avant envoi auto (dans `envoyerDocsAuto`, avant le seuil ≥90%):
```javascript
if (!prospect.nom || prospect.nom.length < 3 || 
    BLACKLIST_NAMES.some(b => (prospect.nom||'').toLowerCase().includes(b))) {
  await notifTelegram(`⚠️ LEAD CENTRIS — NOM SUSPECT: "${prospect.nom}"\nValidation manuelle requise.`);
  return { status: 'pending_name_validation' };
}
```

### A4. Cc shawn@ OBLIGATOIRE sur tous les envois auto
Dans `envoyerDocsAuto()`, vérifier que le Cc `shawn@signaturesb.com` est toujours inclus en visible (pas BCC).
Si le path auto bypasse le Cc → forcer le même comportement que l'outil manuel `envoyer_docs_prospect`.

### A5. Notification Telegram synthèse (remplacer le format actuel)

**Quand envoi auto réussi:**
```
🎯 LEAD AUTO ENVOYÉ
[Prénom Nom] — [téléphone]
Propriété: [adresse] (#[Centris])
Match Dropbox: [score]% | [n] docs envoyés
Cc: shawn@signaturesb.com ✅
Deal Pipedrive: #[id]
```

**Quand PENDING (80-89%):**
```
⏳ LEAD À VALIDER (match [score]%)
[Prénom Nom] — [téléphone]
Dossier suggéré: [nom dossier Dropbox]
Réponds "envoie" pour confirmer ou "annule [id]" pour skip.
```

**Quand nom suspect:**
```
⚠️ LEAD CENTRIS — NOM SUSPECT
Nom capturé: "[nom]"
Email: [email] | Tel: [tel]
Propriété: #[Centris]
Action: valide manuellement avant envoi.
```

### A6. Logging structuré (append à `/data/LEADS_LOG.jsonl`)
```javascript
function logLead(data) {
  const entry = {
    ts: new Date().toISOString(),
    centris: data.centris,
    nom: data.nom,
    email: data.email,
    tel: data.tel,
    parse_method: data.parseMethod, // 'regex' | 'haiku'
    pipedrive_deal: data.dealId,
    dropbox_match: data.dropboxScore,
    dropbox_dossier: data.dropboxDossier,
    envoi: data.envoi, // 'auto' | 'pending' | 'brouillon' | 'skip_name'
    docs_count: data.docsCount,
    duree_ms: data.dureeMs
  };
  fs.appendFileSync('/data/LEADS_LOG.jsonl', JSON.stringify(entry) + '\n');
}
```

### A7. Créer `test_flux_centris.js` (tests non-régression)
5 scénarios à couvrir:
- ✅ Lead Centris propre → deal + envoi auto
- ✅ Lead avec "Shawn Barrette" dans header → pending_name_validation
- ✅ Lead sans #Centris mais adresse claire → match fuzzy Dropbox
- ✅ Lead doublon (même email <7j) → skip silencieux
- ✅ Lead match <80% → brouillon seulement, pas d'envoi

---

## 📋 BLOC B — TÉLÉCHARGEMENT DOCS CENTRIS COMPLET

### Objectif
Quand Shawn dit "envoie les docs du #12345678 à client@email.com" → le bot doit:
1. Se connecter à Centris agent (code 110509)
2. Télécharger TOUS les docs disponibles (fiche + DV + plans + annexes)
3. Envoyer par email avec template Signature SB + Cc shawn@

### Outil MCP existant: `telecharger_fiche_centris`
Cet outil télécharge seulement la **fiche PDF** principale.
Il faut l'**étendre** pour récupérer les annexes.

### Extension à faire dans bot.js:

```javascript
// Nouvel outil MCP: telecharger_docs_centris_complet
{
  name: "telecharger_docs_centris_complet",
  description: "Télécharge TOUS les docs d'un listing Centris (fiche + DV + plans + annexes) et envoie par email avec template Signature SB.",
  parameters: {
    centris_num: { type: "string", description: "Numéro Centris 7-9 chiffres" },
    email_destination: { type: "string", description: "Email du destinataire" },
    cc: { type: "string", description: "CCs additionnels (shawn@ est auto)" },
    message_perso: { type: "string", description: "Message personnalisé optionnel" }
  },
  required: ["centris_num", "email_destination"]
}
```

### Logique handler:
1. Appeler `telecharger_fiche_centris` pour la fiche principale
2. Chercher dossier Dropbox via `matchDropboxAvance(centris_num)` 
3. Si match ≥ 70% → récupérer TOUS les PDFs du dossier Dropbox
4. Combiner fiche Centris + docs Dropbox
5. Envoyer avec `envoyer_docs_prospect` (multi-PJ)
6. Note Pipedrive automatique

### Réponse Telegram à Shawn:
```
✅ DOCS ENVOYÉS — #[centris]
Destinataire: [email]
Cc: shawn@ ✅
Docs: [n] fichiers ([taille]MB)
  • Fiche Centris (PDF)
  • [liste docs Dropbox]
Deal: note ajoutée ✅
```

---

## 📋 BLOC C — FIRECRAWL ZONAGE (brancher dans bot.js)

Le fichier `firecrawl_scraper.js` est DÉJÀ COMPLET dans le repo.
Il faut seulement le **brancher dans bot.js**.

### C1. Import en haut de bot.js:
```javascript
const { scrapMunicipalite, scrapUrl } = require('./firecrawl_scraper');
```

### C2. Ajouter 3 outils MCP dans le tableau `tools[]`:

**Outil 1 — scraper_site_municipal:**
```javascript
{
  name: "scraper_site_municipal",
  description: "Scraper le site d'une municipalité québécoise pour obtenir règlements de zonage, marges latérales, permis, taxes. Cache 30j. Fallback téléphone auto si scrape échoue. Villes: sainte-julienne, rawdon, chertsey, saint-calixte, saint-jean-de-matha, saint-didace, matawinie, d-autray.",
  parameters: {
    ville: {
      type: "string",
      description: "Nom ville slug (sainte-julienne, rawdon, chertsey, saint-calixte, saint-jean-de-matha, saint-didace, matawinie, d-autray)"
    },
    sujet: {
      type: "string",
      enum: ["zonage", "urbanisme", "permis", "taxes", "riveraine"],
      description: "Type info (défaut zonage)"
    }
  },
  required: ["ville"]
}
```

**Outil 2 — scraper_url:**
```javascript
{
  name: "scraper_url",
  description: "Scraper n'importe quelle URL et extraire markdown (règlements, PDFs convertis, pages gouv). Utiliser mots_cles pour filtrer la section pertinente.",
  parameters: {
    url: { type: "string", description: "URL complète https://..." },
    mots_cles: {
      type: "array",
      items: { type: "string" },
      description: "Mots-clés pour filtrer la section (ex: [\"marge\",\"latérale\",\"recul\"])"
    }
  },
  required: ["url"]
}
```

**Outil 3 — scraper_avance:**
```javascript
{
  name: "scraper_avance",
  description: "Scrape une URL + extrait automatiquement TOUS les liens PDF trouvés. Utile pour explorer un site municipal où les docs sont en PDF.",
  parameters: {
    url: { type: "string", description: "URL à scraper" },
    mots_cles: {
      type: "array",
      items: { type: "string" },
      description: "OPTIONNEL — filtrer le contenu par mots-clés"
    },
    telecharger_pdfs: {
      type: "boolean",
      description: "OPTIONNEL — si true, download auto les PDFs trouvés (max 5)"
    }
  },
  required: ["url"]
}
```

### C3. Ajouter les handlers dans le switch:

```javascript
case 'scraper_site_municipal': {
  const { ville, sujet = 'zonage' } = args;
  try {
    const result = await scrapMunicipalite(ville, sujet);
    return result.success 
      ? { content: result.markdown, source: result.url, cached: result.fromCache }
      : { error: result.error, fallback: result.fallbackTelephone };
  } catch (e) {
    return { error: `Erreur scraping: ${e.message}` };
  }
}

case 'scraper_url': {
  const { url, mots_cles = [] } = args;
  try {
    const result = await scrapUrl(url, mots_cles);
    return result.success
      ? { content: result.markdown, url: result.url }
      : { error: result.error };
  } catch (e) {
    return { error: `Erreur scraping URL: ${e.message}` };
  }
}

case 'scraper_avance': {
  const { url, mots_cles = [], telecharger_pdfs = false } = args;
  try {
    const result = await scrapUrl(url, mots_cles);
    // Extraire liens PDF du markdown
    const pdfLinks = (result.markdown || '').match(/https?:\/\/[^\s)]+\.pdf/gi) || [];
    return {
      content: result.markdown,
      pdfs_trouves: pdfLinks,
      count: pdfLinks.length
    };
  } catch (e) {
    return { error: `Erreur scraping avancé: ${e.message}` };
  }
}
```

### C4. Variable d'env — ajouter dans Render:
```
FIRECRAWL_API_KEY=fc-52e378f6759746e4807406ddc3517d07
FIRECRAWL_QUOTA_MONTHLY=500
```

---

## 🔧 ORDRE D'EXÉCUTION OBLIGATOIRE

```
1. git pull origin main
2. Lire bot.js (comprendre structure actuelle)
3. Implémenter BLOC A (parsing + logging + notifs)
4. node test_flux_centris.js → tous les tests passent
5. Implémenter BLOC B (telecharger_docs_centris_complet)
6. Tester manuellement avec un vrai #Centris
7. Implémenter BLOC C (brancher firecrawl_scraper.js)
8. Test: "marges Rawdon" → réponse en <10s
9. git add -A && git commit -m "[SESSION 2026-05-13] Flux Centris durci + Docs complets + Firecrawl zonage"
10. git push origin main
11. Vérifier deploy Render → /health OK
12. Mettre à jour SESSION_LIVE.md avec résultats
```

---

## ✅ CRITÈRES DE SUCCÈS

- [ ] `parseLeadEmail` n'extrait JAMAIS shawn@/julie@ comme prospect
- [ ] Envoi auto toujours avec Cc shawn@ visible
- [ ] Notification Telegram format nouveau (3 cas: auto/pending/nom suspect)
- [ ] `telecharger_docs_centris_complet` envoie fiche + docs Dropbox en 1 email
- [ ] `scraper_site_municipal` retourne infos zonage Rawdon en <10s
- [ ] `scraper_url` extrait une section filtrée par mots-clés
- [ ] Deploy Render sans erreur
- [ ] `/health` retourne 200 avec tools_count augmenté

---

## 🚫 NE PAS FAIRE

- Ne pas toucher aux seuils 80/90% sans validation Shawn
- Ne pas modifier le template email (fond #0a0a0a, logos base64)
- Ne pas push si un seul test échoue
- Ne pas baisser le quota Firecrawl sous 500

---

## 📞 SI BLOQUÉ

Écrire dans `SESSION_LIVE.md`:
```markdown
## ⚠️ BLOQUÉ — [date] [heure]
**Blocage:** [description précise]
**Fichier:** [bot.js ligne X]
**Attendu vs Obtenu:** ...
**Tentatives:** [ce qui a été essayé]
```

Le bot Telegram lit SESSION_LIVE.md automatiquement → Shawn sera notifié.

---

*Prompt généré par Kira le 2026-05-13 23:01 | Signature SB*
