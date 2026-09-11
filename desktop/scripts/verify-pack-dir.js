'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  missingBundleResources,
  resolveStudioReporterBin,
} = require('../electron/paths.js');

/**
 * Locate electron-builder `--dir` output under dist/.
 * @param {string} distDir
 * @returns {string|null} absolute path to unpacked app root
 */
function findUnpackedAppDir(distDir) {
  if (!distDir || !fs.existsSync(distDir)) return null;
  const preferred = [
    'linux-unpacked',
    'mac',
    'mac-arm64',
    'win-unpacked',
    'win-ia32-unpacked',
  ];
  for (const name of preferred) {
    const candidate = path.join(distDir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  // Fallback: any *-unpacked directory
  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.isDirectory() && /unpacked$/i.test(ent.name)) {
      return path.join(distDir, ent.name);
    }
  }
  // mac .app bundle directly under dist/mac already covered; also scan *.app
  for (const ent of entries) {
    if (ent.isDirectory() && ent.name.endsWith('.app')) {
      return path.join(distDir, ent.name);
    }
  }
  return null;
}

/**
 * Resolve the Electron resources directory inside an unpacked build.
 * @param {string} unpackedRoot
 */
function resolveResourcesDir(unpackedRoot) {
  const direct = path.join(unpackedRoot, 'resources');
  if (fs.existsSync(direct)) return direct;
  // macOS: Studio Reporter.app/Contents/Resources
  const mac = path.join(unpackedRoot, 'Contents', 'Resources');
  if (fs.existsSync(mac)) return mac;
  return null;
}

/**
 * Verify packaged Desktop layout for smoke testing.
 * @param {string} unpackedRoot
 * @returns {{ ok: boolean, unpackedRoot: string, resourcesDir?: string, errors: string[] }}
 */
function verifyUnpackedDesktop(unpackedRoot) {
  const errors = [];
  if (!unpackedRoot || !fs.existsSync(unpackedRoot)) {
    return { ok: false, unpackedRoot: unpackedRoot || '', errors: ['unpacked app directory not found'] };
  }

  const resourcesDir = resolveResourcesDir(unpackedRoot);
  if (!resourcesDir) {
    errors.push('resources/ directory missing inside unpacked app');
    return { ok: false, unpackedRoot, errors };
  }

  // App payload: asar or unpacked app/
  const asar = path.join(resourcesDir, 'app.asar');
  const appDir = path.join(resourcesDir, 'app');
  if (!fs.existsSync(asar) && !fs.existsSync(appDir)) {
    errors.push('neither resources/app.asar nor resources/app found');
  } else if (fs.existsSync(appDir)) {
    const mainJs = path.join(appDir, 'electron', 'main.js');
    const pkg = path.join(appDir, 'package.json');
    if (!fs.existsSync(mainJs)) errors.push('resources/app/electron/main.js missing');
    if (!fs.existsSync(pkg)) errors.push('resources/app/package.json missing');
  }

  for (const rel of missingBundleResources(resourcesDir)) {
    errors.push(`extraResource missing: ${rel}`);
  }
  const bin = resolveStudioReporterBin(resourcesDir);
  if (!bin || bin === 'studio-reporter') {
    errors.push('extraResource missing: bin/studio-reporter');
  } else {
    try {
      fs.accessSync(bin, fs.constants.X_OK);
    } catch {
      errors.push(`bin/studio-reporter is not executable: ${bin}`);
    }
  }

  return {
    ok: errors.length === 0,
    unpackedRoot,
    resourcesDir,
    errors,
  };
}

/**
 * Smoke-check a desktop/dist directory produced by `electron-builder --dir`.
 * @param {string} distDir
 */
function verifyPackDist(distDir) {
  const unpacked = findUnpackedAppDir(distDir);
  if (!unpacked) {
    return {
      ok: false,
      unpackedRoot: '',
      errors: [`no unpacked app found under ${distDir}`],
    };
  }
  return verifyUnpackedDesktop(unpacked);
}

module.exports = {
  findUnpackedAppDir,
  resolveResourcesDir,
  verifyUnpackedDesktop,
  verifyPackDist,
};
