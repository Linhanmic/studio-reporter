'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROTOCOL,
  parseDeepLink,
  extractDeepLinkFromArgv,
  buildCompareDeepLink,
  createDeepLinkQueue,
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

  it('parses compare base/target and optional hub', () => {
    const a = parseDeepLink('studio-reporter://compare?base=run-1&target=run-2');
    assert.equal(a.ok, true);
    assert.equal(a.action, 'compare');
    assert.equal(a.base, 'run-1');
    assert.equal(a.target, 'run-2');
    assert.equal(a.hub, undefined);

    const b = parseDeepLink(
      'studio-reporter://compare?a=old&b=new&hub=/tmp/hub'
    );
    assert.equal(b.ok, true);
    assert.equal(b.base, 'old');
    assert.equal(b.target, 'new');
    assert.equal(b.hub, '/tmp/hub');

    const c = parseDeepLink('studio-reporter://compare?from=x&to=y&dir=/hub');
    assert.equal(c.ok, true);
    assert.equal(c.base, 'x');
    assert.equal(c.target, 'y');
    assert.equal(c.hub, '/hub');
  });

  it('rejects compare without distinct base/target', () => {
    assert.equal(parseDeepLink('studio-reporter://compare').ok, false);
    assert.equal(parseDeepLink('studio-reporter://compare?base=only').ok, false);
    assert.equal(
      parseDeepLink('studio-reporter://compare?base=same&target=same').ok,
      false
    );
  });


  it('parses and builds compare kinds filter', () => {
    const a = parseDeepLink(
      'studio-reporter://compare?base=r1&target=r2&kinds=regressed,fixed,nope'
    );
    assert.equal(a.ok, true);
    assert.deepEqual(a.kinds, ['regressed', 'fixed']);

    const b = parseDeepLink(
      'studio-reporter://compare?base=r1&target=r2&kind=added&kind=removed'
    );
    assert.equal(b.ok, true);
    assert.deepEqual(b.kinds, ['added', 'removed']);

    const url = buildCompareDeepLink({
      base: 'r1',
      target: 'r2',
      kinds: ['reason_changed', 'regressed'],
    });
    assert.match(url, /kinds=reason_changed%2Cregressed|kinds=regressed%2Creason_changed/);
    const round = parseDeepLink(url);
    assert.deepEqual(new Set(round.kinds), new Set(['reason_changed', 'regressed']));

    const bare = buildCompareDeepLink({ base: 'a', target: 'b', kinds: [] });
    assert.equal(bare, 'studio-reporter://compare?base=a&target=b');
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

  it('buildCompareDeepLink encodes base/target/hub', () => {
    const url = buildCompareDeepLink({
      base: 'run a',
      target: 'run/b',
      hub: '/tmp/hub path',
    });
    assert.match(url, /^studio-reporter:\/\/compare\?/);
    const parsed = parseDeepLink(url);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.base, 'run a');
    assert.equal(parsed.target, 'run/b');
    assert.equal(parsed.hub, '/tmp/hub path');

    const bare = buildCompareDeepLink({ base: 'a', target: 'b' });
    assert.equal(bare, 'studio-reporter://compare?base=a&target=b');
    assert.throws(() => buildCompareDeepLink({ base: 'x', target: 'x' }), /differ/);
    assert.throws(() => buildCompareDeepLink({ base: 'x' }), /requires/);
  });

  it('createDeepLinkQueue queues until flush and dedupes', async () => {
    const handled = [];
    const q = createDeepLinkQueue({
      handle: async (parsed) => {
        handled.push(parsed.action);
        return { ok: true, action: parsed.action };
      },
    });
    const first = await q.enqueue('studio-reporter://compare?base=a&target=b');
    assert.equal(first.queued, true);
    await q.enqueue('studio-reporter://compare?base=a&target=b'); // consecutive dedupe
    assert.equal(q.pendingCount, 1);
    assert.equal(q.ready, false);
    const bad = await q.enqueue('https://example.com');
    assert.equal(bad.ok, false);
    const results = await q.flush();
    assert.equal(q.ready, true);
    assert.equal(q.pendingCount, 0);
    assert.equal(results.length, 1);
    assert.deepEqual(handled, ['compare']);
    const live = await q.enqueue('studio-reporter://hub?dir=/tmp/hub');
    assert.equal(live.ok, true);
    assert.deepEqual(handled, ['compare', 'hub']);
  });

  it('createDeepLinkQueue requires handle', () => {
    assert.throws(() => createDeepLinkQueue({}), /handle/);
  });

});
