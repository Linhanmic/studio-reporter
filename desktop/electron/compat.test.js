'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  MIN_PLUGIN_VERSION,
  compareSemver,
  checkPluginHello,
} = require('./compat.js');

describe('compat', () => {
  it('compareSemver orders versions', () => {
    assert.ok(compareSemver('0.5.2', '0.5.0') > 0);
    assert.ok(compareSemver('0.4.9', MIN_PLUGIN_VERSION) < 0);
    assert.equal(compareSemver('0.5.0', '0.5.0'), 0);
  });

  it('checkPluginHello rejects old plugins', () => {
    const bad = checkPluginHello({
      version: '0.4.0',
      capabilities: ['ReportSnapshot', 'ReportGenerated', 'RequestSnapshot'],
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.level, 'error');
  });

  it('checkPluginHello accepts current plugin', () => {
    const ok = checkPluginHello({
      version: '0.5.2',
      capabilities: [
        'ReportSnapshot',
        'ReportGenerated',
        'RequestSnapshot',
        'Ping',
        'ClientHello',
      ],
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.level, 'ok');
  });

  it('warns on missing capabilities', () => {
    const w = checkPluginHello({ version: '0.5.2', capabilities: ['Ping'] });
    assert.equal(w.ok, false);
    assert.equal(w.level, 'warn');
    assert.ok(w.missingCaps.includes('ReportSnapshot'));
  });
});
