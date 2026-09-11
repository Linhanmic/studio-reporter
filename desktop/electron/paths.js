'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Root that holds viewer.html, report-assets/, and bin/studio-reporter.
 * Dev: repository root (parent of desktop/).
 * Packaged: Electron extraResources directory (process.resourcesPath).
 *
 * @param {boolean} isPackaged
 * @param {string} resourcesPath process.resourcesPath when packaged
 * @param {string} desktopDir absolute path to the desktop/ package directory
 */
function resolveBundleRoot(isPackaged, resourcesPath, desktopDir) {
  if (isPackaged) {
    return path.resolve(resourcesPath);
  }
  return path.resolve(desktopDir, '..');
}

/**
 * Locate the studio-reporter CLI used for PDF / single-file export.
 * @param {string} bundleRoot
 * @returns {string|null}
 */
function resolveStudioReporterBin(bundleRoot) {
  const candidates = [
    path.join(bundleRoot, 'bin', 'studio-reporter'),
    path.join(bundleRoot, 'bin', 'studio-reporter.exe'),
    'studio-reporter',
  ];
  for (const c of candidates) {
    if (c === 'studio-reporter') return c;
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Files that must exist in the bundle root for live viewer + export.
 * @param {string} bundleRoot
 */
function missingBundleResources(bundleRoot) {
  const required = ['viewer.html', path.join('report-assets', 'report-app.js')];
  return required.filter((rel) => !fs.existsSync(path.join(bundleRoot, rel)));
}

module.exports = {
  resolveBundleRoot,
  resolveStudioReporterBin,
  missingBundleResources,
};
