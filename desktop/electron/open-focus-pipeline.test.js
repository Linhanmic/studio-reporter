'use strict';

/**
 * Desktop open-pipeline smoke: deep link → share hash → (optional) Chrome dump-dom.
 * Mirrors main.openReportDir: parseDeepLink → resolveReportOpenHash → appendShareHash.
 * Also locks producer chains: history digest + compare share card → open → DOM.
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
  extractFailSummaryFocusHashes,
} = require('./share-hash.js');
const {
  buildHistoryFailDigest,
  buildHistoryFailDigestOpenLinks,
} = require('./history-digest.js');
const { compareHistoryRuns, buildCompareShareJson } = require('./compare.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function deepLinkToReportURL(link, baseUrl) {
  const parsed = parseDeepLink(link);
  assert.equal(parsed.ok, true, `deep link parse failed: ${JSON.stringify(parsed)}`);
  const hash = resolveReportOpenHash({
    focus: parsed.focus,
    failSteps: parsed.failSteps,
  });
  return {
    parsed,
    hash,
    url: appendShareHash(baseUrl, hash),
  };
}

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  for (const name of [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'chrome',
  ]) {
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

function writePathFocusFixture(focus) {
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
  return { dir, index, fileURL: pathToFileURL(index).href };
}

function assertChromeOpensFocus(chrome, link, focus) {
  const { dir, fileURL } = writePathFocusFixture(focus);
  try {
    const { url, hash, parsed } = deepLinkToReportURL(link, fileURL);
    assert.equal(parsed.focus, focus);
    assert.ok(!hash.includes('%2F'), 'hash keeps literal slash');
    const dom = chromeDumpDOM(chrome, url);
    const { found, open, tag } = detailsOpenForId(dom, focus);
    assert.ok(found, `details for ${focus} missing in dump-dom`);
    assert.ok(open, `expected details open; tag=${tag}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
    const { parsed, hash, url } = deepLinkToReportURL(link, 'http://127.0.0.1:9/index.html');
    assert.equal(parsed.focus, focus);
    assert.equal(parsed.failSteps, true);
    assert.equal(hash, `${focus}?failSteps=1`);
    assert.ok(!hash.includes('%2F'), 'hash keeps literal slash');
    assert.equal(url, `http://127.0.0.1:9/index.html#${focus}?failSteps=1`);
    assert.equal(parseShareHash(new URL(url).hash).focus, focus);
  });

  it('Chrome dump-dom: Desktop pipeline hash opens path-style details', () => {
    const chrome = findChrome();
    if (!chrome) {
      if (process.env.REQUIRE_CHROME === '1') {
        assert.fail('chrome required (REQUIRE_CHROME=1) for open-focus pipeline smoke');
      }
      return;
    }
    const focus = 'spec:specs/auth/login.spec';
    const link = buildOpenDeepLink({ run: 'r', focus, failSteps: true });
    assertChromeOpensFocus(chrome, link, focus);

    // Legacy %2F focus in the fragment still opens (decodeShareFocus).
    const { dir, fileURL } = writePathFocusFixture(focus);
    try {
      const legacyURL = `${fileURL}#spec:specs%2Fauth%2Flogin.spec`;
      const legacyDom = chromeDumpDOM(chrome, legacyURL);
      const legacy = detailsOpenForId(legacyDom, focus);
      assert.ok(legacy.found && legacy.open, `legacy %2F focus did not open; tag=${legacy.tag}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('history digest open link → Desktop pipeline opens path-style focus', () => {
    const focus = 'spec:specs/auth/login.spec-scn-0';
    const digest = buildHistoryFailDigest(
      [
        {
          id: 'run-digest-1',
          verdict: 'fail',
          topFailReason: 'assert failed',
          topFailFocus: focus,
          timestampISO: '2026-09-11T12:00:00Z',
        },
      ],
      { limit: 5 }
    );
    assert.equal(digest.groups[0].lastRunFocus, focus);
    const links = buildHistoryFailDigestOpenLinks(digest, {
      hubDir: '/tmp/hub',
      mode: 'latest',
    });
    const link = links.trim().split('\n')[0];
    assert.ok(link.includes('%2F'), 'digest link encodes slash');
    const { parsed, hash } = deepLinkToReportURL(link, 'http://127.0.0.1:9/index.html');
    assert.equal(parsed.focus, focus);
    assert.equal(hash, `${focus}?failSteps=1`);

    const chrome = findChrome();
    if (!chrome) {
      if (process.env.REQUIRE_CHROME === '1') {
        assert.fail('chrome required (REQUIRE_CHROME=1) for digest→open focus smoke');
      }
      return;
    }
    assertChromeOpensFocus(chrome, link, focus);
  });

  it('compare share card open link → Desktop pipeline opens path-style focus', () => {
    const focus = 'spec:specs/auth/login.spec-scn-0';
    const base = {
      id: 'base-1',
      projectName: 'demo',
      timestamp: 't1',
      duration: '00:00:01.000',
      verdict: 'pass',
      summary: {
        specs: { total: 1, passed: 1, failed: 0, skipped: 0 },
        scenarios: { total: 1, passed: 1, failed: 0, skipped: 0 },
        steps: { total: 1, passed: 1, failed: 0, skipped: 0 },
      },
    };
    const target = {
      id: 'target-1',
      projectName: 'demo',
      timestamp: 't2',
      duration: '00:00:02.000',
      verdict: 'fail',
      summary: {
        specs: { total: 1, passed: 0, failed: 1, skipped: 0 },
        scenarios: { total: 1, passed: 0, failed: 1, skipped: 0 },
        steps: { total: 1, passed: 0, failed: 1, skipped: 0 },
      },
    };
    const cmp = compareHistoryRuns(base, target);
    cmp.scenarioCompare = {
      changed: [
        {
          kind: 'regressed',
          specName: 'Login',
          scnName: 'valid user',
          baseScnId: focus,
          targetScnId: focus,
          baseVerdict: 'pass',
          targetVerdict: 'fail',
          targetReason: 'timeout',
        },
      ],
      unchangedCount: 0,
      baseCount: 1,
      targetCount: 1,
    };
    const json = JSON.parse(buildCompareShareJson(cmp, { hub: '/tmp/hub' }));
    const link = json.scenarioCompare.changed[0].openLinks.target;
    assert.ok(link && link.includes('%2F'), 'compare link encodes slash');
    const { parsed, hash } = deepLinkToReportURL(link, 'http://127.0.0.1:9/index.html');
    assert.equal(parsed.focus, focus);
    assert.ok(hash.startsWith(focus));

    const chrome = findChrome();
    if (!chrome) {
      if (process.env.REQUIRE_CHROME === '1') {
        assert.fail('chrome required (REQUIRE_CHROME=1) for compare→open focus smoke');
      }
      return;
    }
    assertChromeOpensFocus(chrome, link, focus);
  });

  it('fail-summary Markdown focus → Desktop open pipeline opens path-style details', () => {
    const focus = 'spec:specs/auth/login.spec-scn-0';
    // Mirrors static_report.js collectFailSummary "定位:" lines (literal '/').
    const md = [
      '# Studio Reporter — 失败摘要',
      '',
      '## 失败场景',
      `1. Bad password (\`${focus}\`)`,
      '   - assertion failed: password',
      `   - 定位: \`#${focus}\``,
      '',
    ].join('\n');
    const ids = extractFailSummaryFocusHashes(md);
    assert.deepEqual(ids, [focus]);
    const hash = resolveReportOpenHash({ focus: ids[0], failSteps: true });
    assert.equal(hash, `${focus}?failSteps=1`);
    assert.ok(!hash.includes('%2F'), 'hash keeps literal slash for DOM id');

    // Same producer→consumer path as deep links: build open deeplink from extracted focus.
    const link = buildOpenDeepLink({
      run: 'run-summary-1',
      hub: '/tmp/hub',
      focus: ids[0],
      failSteps: true,
    });
    assert.ok(link.includes('%2F'), 'open query encodes slash');
    const { parsed, hash: openHash } = deepLinkToReportURL(link, 'http://127.0.0.1:9/index.html');
    assert.equal(parsed.focus, focus);
    assert.equal(openHash, `${focus}?failSteps=1`);

    const chrome = findChrome();
    if (!chrome) {
      if (process.env.REQUIRE_CHROME === '1') {
        assert.fail('chrome required (REQUIRE_CHROME=1) for fail-summary→open focus smoke');
      }
      return;
    }
    assertChromeOpensFocus(chrome, link, focus);
  });

});
