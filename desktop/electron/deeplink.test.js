'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROTOCOL,
  parseDeepLink,
  extractDeepLinkFromArgv,
} = require('./deeplink.js');

describe('deeplink', () => {
  it('exports protocol name', () => {
    assert.equal(PROTOCOL, 'studio-reporter');
  });

  it('parses open path/dir', () => {
    const a = parseDeepLink('studio-reporter://open?path=/tmp/r/index.html');
    assert.equal(a.ok, true);
    assert.equal(a.action, 'open');
    assert.equal(a.path, '/tmp/r/index.html');

    const b = parseDeepLink('studio-reporter://open?dir=/tmp/r');
    assert.equal(b.ok, true);
    assert.equal(b.dir, '/tmp/r');

    const c = parseDeepLink('studio-reporter://open?path=/tmp/r/run.uhilreport');
    assert.equal(c.ok, true);
    assert.equal(c.path, '/tmp/r/run.uhilreport');
  });

  it('parses connect ws url', () => {
    const a = parseDeepLink('studio-reporter://connect?url=ws://127.0.0.1:9876');
    assert.equal(a.ok, true);
    assert.equal(a.action, 'connect');
    assert.equal(a.url, 'ws://127.0.0.1:9876');
  });

  it('parses hub dir', () => {
    const a = parseDeepLink('studio-reporter://hub?dir=/tmp/hub');
    assert.equal(a.ok, true);
    assert.equal(a.action, 'hub');
    assert.equal(a.dir, '/tmp/hub');
  });

  it('rejects bad input', () => {
    assert.equal(parseDeepLink('').ok, false);
    assert.equal(parseDeepLink('https://example.com').ok, false);
    assert.equal(parseDeepLink('studio-reporter://connect?url=http://x').ok, false);
    assert.equal(parseDeepLink('studio-reporter://open').ok, false);
    assert.equal(parseDeepLink('studio-reporter://nope').ok, false);
  });

  it('extractDeepLinkFromArgv finds protocol arg', () => {
    assert.equal(
      extractDeepLinkFromArgv([
        'electron',
        '.',
        'studio-reporter://open?dir=/tmp/r',
      ]),
      'studio-reporter://open?dir=/tmp/r'
    );
    assert.equal(extractDeepLinkFromArgv(['electron', '.']), null);
  });
});
