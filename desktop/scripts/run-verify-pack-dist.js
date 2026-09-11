#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { verifyPackDist } = require('./verify-pack-dir.js');

const distDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const result = verifyPackDist(distDir);

if (!result.ok) {
  console.error(`Pack smoke FAILED for ${distDir}`);
  for (const err of result.errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log('Pack smoke OK');
console.log(`  platform: ${result.platform || 'unknown'}`);
console.log(`  unpacked: ${result.unpackedRoot}`);
console.log(`  resources: ${result.resourcesDir}`);
