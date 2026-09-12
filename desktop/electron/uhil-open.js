'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const UHIL_EXT = '.uhilreport';

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isUhilreportPath(filePath) {
  const raw = String(filePath || '').trim();
  if (!raw) return false;
  return path.extname(raw).toLowerCase() === UHIL_EXT;
}

/**
 * Default regenerate output dir: same folder as the .uhilreport (sibling images/).
 * @param {string} uhilPath
 * @returns {string}
 */
function resolveUhilOutDir(uhilPath) {
  return path.resolve(path.dirname(String(uhilPath || '')));
}

/**
 * Build CLI argv for `studio-reporter generate`.
 * @param {string} uhilPath
 * @param {string} [outDir]
 * @returns {string[]}
 */
function buildGenerateArgs(uhilPath, outDir) {
  const input = path.resolve(String(uhilPath || ''));
  const out = path.resolve(outDir || resolveUhilOutDir(input));
  return ['generate', '--input', input, '--out', out];
}

/**
 * Regenerate HTML from a .uhilreport via the bundled CLI.
 * @param {object} opts
 * @param {string} opts.bin absolute or PATH name of studio-reporter
 * @param {string} opts.uhilPath
 * @param {string} [opts.outDir]
 * @param {(cmd: string, args: string[], opts: object) => {status:number|null, stdout?:string, stderr?:string}} [opts.spawn]
 * @returns {{ok: true, input: string, outDir: string, indexPath: string, log: string} | never}
 */
function regenerateFromUhilreport(opts) {
  const bin = opts?.bin;
  const uhilPath = path.resolve(String(opts?.uhilPath || ''));
  if (!bin) throw new Error('找不到 studio-reporter 可执行文件（请先 make build）');
  if (!isUhilreportPath(uhilPath)) {
    throw new Error(`不是 .uhilreport 文件：${uhilPath || '(empty)'}`);
  }
  if (!fs.existsSync(uhilPath)) {
    throw new Error(`找不到文件：${uhilPath}`);
  }
  const outDir = path.resolve(opts.outDir || resolveUhilOutDir(uhilPath));
  const args = buildGenerateArgs(uhilPath, outDir);
  const spawn = opts.spawn || spawnSync;
  const result = spawn(bin, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `generate failed (${result.status})`);
  }
  const indexPath = path.join(outDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`生成完成但未找到 ${indexPath}`);
  }
  return {
    ok: true,
    input: uhilPath,
    outDir,
    indexPath,
    log: result.stdout || '',
  };
}

module.exports = {
  UHIL_EXT,
  isUhilreportPath,
  resolveUhilOutDir,
  buildGenerateArgs,
  regenerateFromUhilreport,
};
