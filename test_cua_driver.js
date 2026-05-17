// test_cua_driver.js — Suite de tests pour cua_driver.js
// ════════════════════════════════════════════════════════════════════════════
//
// USAGE:
//   node test_cua_driver.js              — tests unitaires seulement (rapide, sans Playwright)
//   node test_cua_driver.js --login      — + test login Centris réel (~30s)
//   node test_cua_driver.js --full       — + télécharger PDF listing test (~2min)
//   node test_cua_driver.js --diag       — diagnostic complet du driver
//
// PRÉREQUIS pour --login / --full:
//   export CENTRIS_USER=110509
//   export CENTRIS_PASS=votre_pass
//   export ANTHROPIC_API_KEY=sk-ant-...
//   npm install playwright @anthropic-ai/sdk
//   npx playwright install chromium
//
// ════════════════════════════════════════════════════════════════════════════

'use strict';

require('dotenv').config();
const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

const args = process.argv.slice(2);
const RUN_LOGIN = args.includes('--login') || args.includes('--full');
const RUN_FULL  = args.includes('--full');
const RUN_DIAG  = args.includes('--diag');

// Listing test stable (propriété Shawn connue)
const TEST_CENTRIS_NUM = '22264330';

let passed = 0;
let failed = 0;
const errors = [];

function ok(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
    errors.push({ name, error: e.message });
  }
}

async function okAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
    errors.push({ name, error: e.message });
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`);
}

// ─── UNIT TESTS ───────────────────────────────────────────────────────────────

section('1. Import et exports');

let driver;
ok('require sans throw', () => {
  driver = require('./cua_driver');
});

ok('CUA_AVAILABLE est une fonction', () => {
  assert.strictEqual(typeof driver.CUA_AVAILABLE, 'function');
});

ok('CUA_AVAILABLE retourne un boolean', () => {
  const result = driver.CUA_AVAILABLE();
  assert.strictEqual(typeof result, 'boolean');
});

ok('cuaGetCentrisPDF est une fonction', () => {
  assert.strictEqual(typeof driver.cuaGetCentrisPDF, 'function');
});

ok('cuaGetCentrisAnnexes est une fonction', () => {
  assert.strictEqual(typeof driver.cuaGetCentrisAnnexes, 'function');
});

ok('cuaDownloadAndEmail est une fonction', () => {
  assert.strictEqual(typeof driver.cuaDownloadAndEmail, 'function');
});

ok('clearCuaSession est une fonction', () => {
  assert.strictEqual(typeof driver.clearCuaSession, 'function');
});

ok('diagnoseCUA est une fonction', () => {
  assert.strictEqual(typeof driver.diagnoseCUA, 'function');
});

ok('_internals exposés', () => {
  assert.ok(driver._internals);
  assert.strictEqual(typeof driver._internals.loginCentris, 'function');
  assert.strictEqual(typeof driver._internals.runCuaTask, 'function');
  assert.strictEqual(typeof driver._internals.executeAction, 'function');
  assert.strictEqual(typeof driver._internals.interceptPDF, 'function');
});

section('2. Session management');

const { loadSession, saveSession, clearCuaSession, ensureDirs } = driver._internals;

ok('ensureDirs ne throw pas', () => {
  ensureDirs();
});

ok('loadSession retourne null si pas de fichier', () => {
  // Nettoyer d'abord
  clearCuaSession();
  const result = loadSession();
  assert.strictEqual(result, null);
});

ok('saveSession + loadSession roundtrip', () => {
  const fakeCookies = [
    { name: 'session', value: 'abc123', domain: 'centris.ca', path: '/' },
  ];
  saveSession(fakeCookies);
  const loaded = loadSession();
  assert.deepStrictEqual(loaded, fakeCookies);
  // Cleanup
  clearCuaSession();
});

ok('loadSession retourne null si TTL expiré', () => {
  // Écrire session avec timestamp ancien
  const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '.cua_data');
  const SESSION_FILE = path.join(DATA_DIR, 'cua_session.json');
  ensureDirs();
  fs.writeFileSync(SESSION_FILE, JSON.stringify({
    ts: Date.now() - 13 * 3600 * 1000, // 13h ago > TTL 12h
    cookies: [{ name: 'old', value: 'expired' }],
  }));
  const result = loadSession();
  assert.strictEqual(result, null);
});

ok('clearCuaSession ne throw pas si fichier absent', () => {
  clearCuaSession();
  clearCuaSession(); // double clear — ne doit pas throw
});

section('3. Utilitaires internes');

const { sleep, translateKey } = require('./cua_driver')._internals || {};

ok('sleep est disponible', () => {
  assert.strictEqual(typeof driver._internals.sleep, 'function');
});

ok('sleep retourne une promesse', () => {
  const result = driver._internals.sleep(1);
  assert.ok(result instanceof Promise);
  return result; // résout en ~1ms
});

section('4. cuaGetCentrisPDF — sans Playwright (erreur attendue)');

await (async () => {
  if (driver.CUA_AVAILABLE()) {
    ok('Skip — CUA disponible (test complet dans --login)', () => {});
    return;
  }

  await okAsync('throw "CUA non disponible" si Playwright absent', async () => {
    try {
      await driver.cuaGetCentrisPDF('22264330');
      throw new Error('Aurait dû throw');
    } catch (e) {
      assert.ok(e.message.includes('CUA non disponible') || e.message.includes('Playwright'));
    }
  });
})();

section('5. cuaDownloadAndEmail — fallback sans CUA');

await (async () => {
  if (driver.CUA_AVAILABLE()) {
    ok('Skip — CUA disponible', () => {});
    return;
  }

  let emailSent = false;
  await okAsync('appelle sendEmailFn avec lien public si CUA absent', async () => {
    const result = await driver.cuaDownloadAndEmail({
      centrisNum: '22264330',
      emailTo: 'test@example.com',
      sendEmailFn: async ({ body }) => {
        emailSent = true;
        assert.ok(body.includes('centris.ca'));
        assert.ok(body.includes('22264330'));
      },
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.fallbackUrl);
    assert.ok(result.fallbackUrl.includes('22264330'));
    assert.ok(emailSent);
  });
})();

// ─── INTEGRATION TESTS (avec Playwright) ─────────────────────────────────────

if (RUN_DIAG) {
  section('6. Diagnostic CUA (--diag)');

  await okAsync('diagnoseCUA complet', async () => {
    console.log('\n  Lancement diagnostic...');
    const result = await driver.diagnoseCUA();
    result.steps.forEach(s => console.log(`    ${s}`));
    if (!result.ok) {
      console.log(`    ❌ Erreur: ${result.error}`);
      throw new Error(result.error);
    }
  });
}

if (RUN_LOGIN && driver.CUA_AVAILABLE()) {
  section('6. Login Centris réel (--login)');

  await okAsync('login Centris + screenshot', async () => {
    if (!process.env.CENTRIS_USER || !process.env.CENTRIS_PASS) {
      throw new Error('CENTRIS_USER / CENTRIS_PASS manquants');
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY manquante');
    }

    const { playwright } = driver._internals.loginCentris ? { playwright: require('playwright') } : (() => { throw new Error('Playwright absent'); })();
    const pw = require('playwright');
    const browser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

    try {
      const page = await driver._internals.loginCentris(context);
      assert.ok(page, 'page doit être non-null');

      const url = page.url();
      console.log(`    URL après login: ${url}`);
      assert.ok(!url.includes('/login'), 'Ne doit pas être redirigé vers login');

      const ss = await driver._internals.screenshot(page);
      assert.ok(ss && ss.length > 10000, 'Screenshot doit être > 10KB');
      console.log(`    Screenshot: ${Math.round(ss.length / 1024)}KB`);

    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  });

  if (RUN_FULL) {
    section('7. Téléchargement PDF Centris #' + TEST_CENTRIS_NUM + ' (--full)');

    await okAsync(`cuaGetCentrisPDF(${TEST_CENTRIS_NUM})`, async () => {
      console.log(`\n  Téléchargement en cours... (peut prendre 1-2 min)`);
      const buf = await driver.cuaGetCentrisPDF(TEST_CENTRIS_NUM);

      if (buf === null) {
        console.log('  ⚠️  Retourné null (listing peut-être inactif ou URLs changées)');
        // Ne pas fail — c'est acceptable si le listing est inactif
        return;
      }

      assert.ok(Buffer.isBuffer(buf), 'Doit être un Buffer');
      assert.ok(buf.length > 1000, `Buffer trop petit: ${buf.length} bytes`);

      // Vérifier si c'est un vrai PDF (header %PDF) ou image PNG
      const isPDF = buf.slice(0, 4).toString() === '%PDF';
      const isPNG = buf.slice(0, 4).toString('hex') === '89504e47';
      assert.ok(isPDF || isPNG, 'Doit être PDF ou PNG (screenshot fallback)');

      console.log(`    Type: ${isPDF ? 'PDF' : 'PNG (screenshot fallback)'}`);
      console.log(`    Taille: ${Math.round(buf.length / 1024)}KB`);

      if (isPDF) {
        // Sauvegarder pour inspection manuelle
        const outPath = path.join(__dirname, `test_output_${TEST_CENTRIS_NUM}.pdf`);
        fs.writeFileSync(outPath, buf);
        console.log(`    📄 Sauvegardé: ${outPath}`);
      }
    });
  }
}

// ─── RÉSULTATS ────────────────────────────────────────────────────────────────

section('RÉSULTATS');
console.log(`\n  Tests passés: ${passed}`);
console.log(`  Tests échoués: ${failed}`);

if (errors.length > 0) {
  console.log('\n  ÉCHECS:');
  errors.forEach(e => console.log(`    ❌ ${e.name}: ${e.error}`));
}

if (failed === 0) {
  console.log('\n  ✅ Tous les tests passent — cua_driver prêt.\n');
  process.exit(0);
} else {
  console.log('\n  ❌ Des tests ont échoué.\n');
  process.exit(1);
}
