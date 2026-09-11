'use strict';

/**
 * Desktop open-pipeline smoke: deep link → share hash → (optional) Chrome dump-dom.
 * Mirrors main.openReportDir: parseDeepLink → resolveReportOpenHash → appendShareHash.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const { buildOpenDeepLink, parseDeepLink } = require('./deeplink.js');
const {
  resolveReportOpenHash,
  appendShareHash,
  parseShareHash,
} = require('./share-hash.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'chrome',
  ];
  for (const name of candidates) {
    const r = spawnSync('which', [name], { encoding: 'utf8' });
    if (r.status === 0) {
      const p = String(r.stdout || '').trim();
      if (p) return p;
    }
  }
  return '';
}

function chromeDumpDOM(chrome, url) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-chrome-'));
  const r = spawnSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=3000',
      '--dump-dom',
      url,
    ],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
  );
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
  if (r.status !== 0) {
    throw new Error(`chrome dump-dom failed: ${r.stderr || r.stdout}`);
  }
  return String(r.stdout || '');
}

function detailsOpenForId(dom, id) {
  const re = new RegExp(
    `<details\\b[^>]*\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`,
    'i'
  );
  const m = dom.match(re);
  if (!m) return { found: false, open: false, tag: '' };
  const tag = m[0];
  const open = /\sopen(?:[\s>]|=)/i.test(tag) || /open>/i.test(tag);
  return { found: true, open, tag };
}

describe('open-focus-pipeline', () => {
  it('deep link → resolveReportOpenHash keeps path slash for DOM id', () => {
    const focus = 'spec:specs/auth/login.spec-scn-0';
    const link = buildOpenDeepLink({
      run: 'run-1',
      hub: '/tmp/hub with space',
      focus,
      failSteps: true,
    });
    assert.ok(link.includes('%2F'), 'query encodes slash');
    const parsed = parseDeepLink(link);
    assert.equal(parsed.focus, focus);
    assert.equal(parsed.failSteps, true);

    const hash = resolveReportOpenHash({
      focus: parsed.focus,
      failSteps: parsed.failSteps,
    });
    assert.equal(hash, `${focus}?failSteps=1`);
    assert.ok(!hash.includes('%2F'), 'hash keeps literal slash');

    const url = appendShareHash('http://127.0.0.1:9/index.html', hash);
    assert.equal(url, `http://127.0.0.1:9/index.html#${focus}?failSteps=1`);
    assert.equal(parseShareHash(new URL(url).hash).focus, focus);
  });

  it('Chrome dump-dom: Desktop pipeline hash opens path-style details', () => {
    const chrome = findChrome();
    if (!chrome) {
      // Desktop unit CI has no Chrome; Go report-browser-smoke already gates dump-dom.
      // Set CHROME_PATH / REQUIRE_CHROME=1 to force this check locally or in a browser job.
      if (process.env.REQUIRE_CHROME === '1') {
        assert.fail('chrome required (REQUIRE_CHROME=1) for open-focus pipeline smoke');
      }
      return;
    }

    const focus = 'spec:specs/auth/login.spec';
    const jsPath = path.join(REPO_ROOT, 'internal/report/static_report.js');
    const cssPath = path.join(REPO_ROOT, 'internal/report/static_report.css');
    assert.ok(fs.existsSync(jsPath), 'static_report.js missing');
    assert.ok(fs.existsSync(cssPath), 'static_report.css missing');
    const js = fs.readFileSync(jsPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-open-focus-'));
    const index = path.join(dir, 'index.html');
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>open-focus-pipeline</title>
<style>${css}</style>
</head>
<body>
<nav class="nav-pane">
  <button type="button" class="nav-item" data-nav-target="overview">Overview</button>
  <button type="button" class="nav-item" data-nav-target="${focus}">Login</button>
</nav>
<div class="result-pane">
  <section id="overview" class="overview-pane">overview</section>
  <details class="report-block tone-fail" data-kind="spec" data-verdict="fail" id="${focus}">
    <summary>Login</summary>
  </details>
</div>
<script>${js}</script>
</body></html>`;
    fs.writeFileSync(index, html, 'utf8');

    try {
      // Same path main.openReportDir uses after parseDeepLink.
      const link = buildOpenDeepLink({ run: 'r', focus, failSteps: true });
      const parsed = parseDeepLink(link);
      const hash = resolveReportOpenHash({
        focus: parsed.focus,
        failSteps: parsed.failSteps,
      });
      const fileURL = pathToFileURL(index).href;
      const url = appendShareHash(fileURL, hash);

      const dom = chromeDumpDOM(chrome, url);
      const { found, open, tag } = detailsOpenForId(dom, focus);
      assert.ok(found, `details for ${focus} missing in dump-dom`);
      assert.ok(open, `expected details open after pipeline hash; tag=${tag}`);

      // Legacy %2F focus in the fragment still opens (decodeShareFocus).
      const legacyURL = `${fileURL}#spec:specs%2Fauth%2Flogin.spec`;
      const legacyDom = chromeDumpDOM(chrome, legacyURL);
      const legacy = detailsOpenForId(legacyDom, focus);
      assert.ok(legacy.found && legacy.open, `legacy %2F focus did not open; tag=${legacy.tag}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
