'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  UHIL_EXT,
  isUhilreportPath,
  resolveUhilOutDir,
  buildGenerateArgs,
  regenerateFromUhilreport,
} = require('./uhil-open.js');

describe('uhil-open helpers', () => {
  it('detects .uhilreport extension', () => {
    assert.equal(UHIL_EXT, '.uhilreport');
    assert.equal(isUhilreportPath('/tmp/a.uhilreport'), true);
    assert.equal(isUhilreportPath('/tmp/A.UHILREPORT'), true);
    assert.equal(isUhilreportPath('/tmp/a/index.html'), false);
    assert.equal(isUhilreportPath(''), false);
  });

  it('defaults out dir to the uhileport folder', () => {
    assert.equal(resolveUhilOutDir('/hub/archives/r1/run.uhilreport'), path.resolve('/hub/archives/r1'));
  });

  it('builds generate argv', () => {
    const args = buildGenerateArgs('/data/run.uhilreport', '/data');
    assert.deepEqual(args, [
      'generate',
      '--input',
      path.resolve('/data/run.uhilreport'),
      '--out',
      path.resolve('/data'),
    ]);
  });

  it('regenerateFromUhilreport spawns CLI and requires index.html', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uhil-open-'));
    const uhil = path.join(dir, 'demo.uhilreport');
    fs.writeFileSync(uhil, '{}');
    const calls = [];
    const fakeSpawn = (bin, args) => {
      calls.push({ bin, args });
      fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
      return { status: 0, stdout: 'ok\n', stderr: '' };
    };
    const result = regenerateFromUhilreport({
      bin: '/fake/studio-reporter',
      uhilPath: uhil,
      spawn: fakeSpawn,
    });
    assert.equal(result.ok, true);
    assert.equal(result.outDir, dir);
    assert.equal(result.indexPath, path.join(dir, 'index.html'));
    assert.equal(calls[0].bin, '/fake/studio-reporter');
    assert.deepEqual(calls[0].args.slice(0, 2), ['generate', '--input']);
  });

  it('rejects missing files and failed generate', () => {
    assert.throws(
      () => regenerateFromUhilreport({ bin: '/bin/true', uhilPath: '/no/such.uhilreport' }),
      /找不到文件/
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uhil-open-fail-'));
    const uhil = path.join(dir, 'demo.uhilreport');
    fs.writeFileSync(uhil, '{}');
    assert.throws(
      () =>
        regenerateFromUhilreport({
          bin: '/fake',
          uhilPath: uhil,
          spawn: () => ({ status: 2, stderr: 'boom', stdout: '' }),
        }),
      /boom/
    );
  });
});
