'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  missingBundleResources,
  resolveStudioReporterBin,
} = require('../electron/paths.js');

/**
 * Prefer electron-builder `--dir` folder names in a stable order.
 * mac/mac-arm64 are directory wrappers that usually contain a *.app bundle.
 */
const PREFERRED_UNPACKED_NAMES = [
  'linux-unpacked',
  'mac',
  'mac-arm64',
  'win-unpacked',
  'win-ia32-unpacked',
];

/**
 * Find a macOS .app bundle under a directory (non-recursive beyond one level).
 * @param {string} dir
 * @returns {string|null}
 */
function findMacAppBundle(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  // The directory itself may already be the .app
  if (dir.endsWith('.app') && fs.statSync(dir).isDirectory()) return dir;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const ent of entries) {
    if (ent.isDirectory() && ent.name.endsWith('.app')) {
      return path.join(dir, ent.name);
    }
  }
  return null;
}

/**
 * Normalize an unpacked root so mac folder wrappers resolve to the .app bundle.
 * @param {string} candidate
 * @returns {string}
 */
function normalizeUnpackedRoot(candidate) {
  if (!candidate) return candidate;
  const base = path.basename(candidate);
  // electron-builder mac --dir writes dist/mac/*.app or dist/mac-arm64/*.app
  if (base === 'mac' || base === 'mac-arm64' || base.startsWith('mac-')) {
    const app = findMacAppBundle(candidate);
    if (app) return app;
  }
  if (candidate.endsWith('.app')) return candidate;
  // Also accept a folder that directly contains a single .app (fallback layouts)
  const nested = findMacAppBundle(candidate);
  if (nested && !fs.existsSync(path.join(candidate, 'resources'))) {
    return nested;
  }
  return candidate;
}

/**
 * Locate electron-builder `--dir` output under dist/.
 * @param {string} distDir
 * @returns {string|null} absolute path to unpacked app root (mac: *.app)
 */
function findUnpackedAppDir(distDir) {
  if (!distDir || !fs.existsSync(distDir)) return null;

  for (const name of PREFERRED_UNPACKED_NAMES) {
    const candidate = path.join(distDir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return normalizeUnpackedRoot(candidate);
    }
  }

  // Fallback: any *-unpacked directory (linux/win variants)
  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.isDirectory() && /unpacked$/i.test(ent.name)) {
      return path.join(distDir, ent.name);
    }
  }
  // *.app directly under dist/
  for (const ent of entries) {
    if (ent.isDirectory() && ent.name.endsWith('.app')) {
      return path.join(distDir, ent.name);
    }
  }
  // dist/<something> that contains a .app (unusual but seen in custom outputs)
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const nested = findMacAppBundle(path.join(distDir, ent.name));
    if (nested) return nested;
  }
  return null;
}

/**
 * Resolve the Electron resources directory inside an unpacked build.
 * Supports linux/win `resources/` and macOS `*.app/Contents/Resources`.
 * @param {string} unpackedRoot
 * @returns {string|null}
 */
function resolveResourcesDir(unpackedRoot) {
  if (!unpackedRoot) return null;

  const direct = path.join(unpackedRoot, 'resources');
  if (fs.existsSync(direct)) return direct;

  // macOS: Studio Reporter.app/Contents/Resources
  const mac = path.join(unpackedRoot, 'Contents', 'Resources');
  if (fs.existsSync(mac)) return mac;

  // mac wrapper folder without normalize (defensive)
  const app = findMacAppBundle(unpackedRoot);
  if (app) {
    const nested = path.join(app, 'Contents', 'Resources');
    if (fs.existsSync(nested)) return nested;
  }
  return null;
}

/**
 * Classify an unpacked root for clearer smoke diagnostics.
 * @param {string} unpackedRoot
 * @returns {'linux'|'mac'|'win'|'unknown'}
 */
function detectUnpackedPlatform(unpackedRoot) {
  if (!unpackedRoot) return 'unknown';
  if (unpackedRoot.endsWith('.app') || fs.existsSync(path.join(unpackedRoot, 'Contents', 'MacOS'))) {
    return 'mac';
  }
  const base = path.basename(unpackedRoot).toLowerCase();
  if (base.startsWith('win') || fs.existsSync(path.join(unpackedRoot, 'Studio Reporter.exe'))) {
    return 'win';
  }
  if (base.startsWith('linux') || fs.existsSync(path.join(unpackedRoot, 'studio-reporter-desktop'))) {
    return 'linux';
  }
  if (fs.existsSync(path.join(unpackedRoot, 'resources'))) {
    // Generic Electron layout shared by linux/win
    return process.platform === 'win32' ? 'win' : 'linux';
  }
  return 'unknown';
}

/**
 * Verify packaged Desktop layout for smoke testing.
 * @param {string} unpackedRoot
 * @returns {{ ok: boolean, unpackedRoot: string, resourcesDir?: string, platform?: string, errors: string[] }}
 */
function verifyUnpackedDesktop(unpackedRoot) {
  const errors = [];
  if (!unpackedRoot || !fs.existsSync(unpackedRoot)) {
    return { ok: false, unpackedRoot: unpackedRoot || '', errors: ['unpacked app directory not found'] };
  }

  const platform = detectUnpackedPlatform(unpackedRoot);
  const resourcesDir = resolveResourcesDir(unpackedRoot);
  if (!resourcesDir) {
    errors.push('resources/ directory missing inside unpacked app');
    return { ok: false, unpackedRoot, platform, errors };
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
    errors.push('extraResource missing: bin/studio-reporter (or .exe)');
  } else {
    const isWinExe = /\.exe$/i.test(bin);
    // Unix executable bit is not meaningful for Windows PE binaries (and win
    // fixtures verified on Linux CI often lack +x).
    if (!isWinExe) {
      try {
        fs.accessSync(bin, fs.constants.X_OK);
      } catch {
        errors.push(`bin/studio-reporter is not executable: ${bin}`);
      }
    }
  }

  // Platform-specific launcher presence (best-effort; names follow productName).
  if (platform === 'mac') {
    const macosDir = path.join(unpackedRoot, 'Contents', 'MacOS');
    if (!fs.existsSync(macosDir)) {
      errors.push('mac app missing Contents/MacOS');
    }
  } else if (platform === 'win') {
    const exes = fs
      .readdirSync(unpackedRoot)
      .filter((name) => name.toLowerCase().endsWith('.exe'));
    if (!exes.length) {
      errors.push('win-unpacked missing application .exe');
    }
  }

  return {
    ok: errors.length === 0,
    unpackedRoot,
    resourcesDir,
    platform,
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
      signing: resolveSigningMode(),
      errors: [`no unpacked app found under ${distDir}`],
    };
  }
  const result = verifyUnpackedDesktop(unpacked);
  return { ...result, signing: resolveSigningMode() };
}

/**
 * Report expected signing mode from env (pack smoke / Release stay unsigned).
 * electron-builder signs only when CSC_* / WIN_CSC_* are set and discovery is on.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'unsigned'|'maybe-signed'}
 */
function resolveSigningMode(env = process.env) {
  const discovery = String(env.CSC_IDENTITY_AUTO_DISCOVERY || '').toLowerCase();
  const discoveryOff = discovery === 'false' || discovery === '0' || discovery === 'no';
  const hasCert =
    !!(env.CSC_LINK || env.CSC_NAME || env.WIN_CSC_LINK || env.CSC_KEY_PASSWORD || env.WIN_CSC_KEY_PASSWORD);
  if (discoveryOff || !hasCert) return 'unsigned';
  return 'maybe-signed';
}

module.exports = {
  PREFERRED_UNPACKED_NAMES,
  findMacAppBundle,
  normalizeUnpackedRoot,
  findUnpackedAppDir,
  resolveResourcesDir,
  detectUnpackedPlatform,
  verifyUnpackedDesktop,
  verifyPackDist,
  resolveSigningMode,
};
