'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  FEED_FILES,
  expectedFeedFileName,
  parseUpdateFeedYaml,
  validateUpdateFeed,
  validatePublishConfig,
  buildSampleLinuxFeed,
} = require('./update-feed.js');

describe('update-feed', () => {
  it('maps platforms to electron-builder feed file names', () => {
    assert.equal(expectedFeedFileName('linux'), 'latest-linux.yml');
    assert.equal(expectedFeedFileName('win'), 'latest.yml');
    assert.equal(expectedFeedFileName('windows'), 'latest.yml');
    assert.equal(expectedFeedFileName('mac'), 'latest-mac.yml');
    assert.equal(expectedFeedFileName('darwin'), 'latest-mac.yml');
    assert.equal(FEED_FILES.linux, 'latest-linux.yml');
  });

  it('parses and validates a sample linux feed', () => {
    const yaml = buildSampleLinuxFeed({
      version: '0.5.2',
      fileName: 'studio-reporter-desktop-0.5.2-x64.AppImage',
      sha512: 'abc123',
      size: 42,
    });
    const feed = parseUpdateFeedYaml(yaml);
    assert.equal(feed.version, '0.5.2');
    assert.equal(feed.path, 'studio-reporter-desktop-0.5.2-x64.AppImage');
    assert.equal(feed.files.length, 1);
    assert.equal(feed.files[0].url, 'studio-reporter-desktop-0.5.2-x64.AppImage');
    assert.equal(feed.files[0].sha512, 'abc123');
    assert.equal(feed.files[0].size, 42);
    const result = validateUpdateFeed(feed, { platform: 'linux' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it('flags missing version / files / sha512', () => {
    const bad = validateUpdateFeed({ files: [{ url: 'a.AppImage' }] });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /version/.test(e)));
    assert.ok(bad.errors.some((e) => /sha512/.test(e)));
  });

  it('validates desktop package.json publish config against repo', () => {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    const result = validatePublishConfig(pkg.build.publish, {
      owner: 'Linhanmic',
      repo: 'studio-reporter',
    });
    assert.equal(result.ok, true, result.errors.join('; '));
    assert.equal(result.publish.provider, 'github');
  });
});
