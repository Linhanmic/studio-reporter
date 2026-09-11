'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Port of internal/report scenario compare (ScenarioLitesFromReport / CompareScenarios).
 */

function normalizeFailReason(msg) {
  let s = String(msg || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (const line of s.split('\n')) {
    const t = line.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    return t.length > 240 ? `${t.slice(0, 240)}…` : t;
  }
  return '';
}

function hookFailReason(h) {
  if (!h) return '';
  const msg = normalizeFailReason(h.errorMessage);
  if (!msg) return '';
  const name = String(h.hookName || '').trim();
  return name ? `${name}: ${msg}` : msg;
}

function firstHookReason(...hooks) {
  for (const h of hooks) {
    const msg = hookFailReason(h);
    if (msg) return msg;
  }
  return '';
}

function itemFailReason(it) {
  if (!it || typeof it !== 'object') return '';
  if (it.kind === 'step') {
    const step = it.step;
    if (!step) return '';
    if (step.verdict !== 'fail') {
      return firstHookReason(step.preHookFailure, step.postHookFailure);
    }
    const msg = normalizeFailReason(step.errorMessage);
    if (msg) return msg;
    return firstHookReason(step.preHookFailure, step.postHookFailure);
  }
  if (it.kind === 'concept') {
    const concept = it.concept;
    if (!concept) return '';
    if (concept.step) {
      if (concept.step.verdict === 'fail') {
        const msg = normalizeFailReason(concept.step.errorMessage);
        if (msg) return msg;
      }
      const hookMsg = firstHookReason(concept.step.preHookFailure, concept.step.postHookFailure);
      if (hookMsg) return hookMsg;
    }
    for (const child of concept.items || []) {
      const msg = itemFailReason(child);
      if (msg) return msg;
    }
  }
  return '';
}

function scenarioPrimaryFailReason(scn) {
  const hook = firstHookReason(scn?.preHookFailure, scn?.postHookFailure);
  if (hook) return hook;
  for (const list of [scn?.contexts, scn?.items, scn?.teardowns]) {
    for (const it of list || []) {
      const msg = itemFailReason(it);
      if (msg) return msg;
    }
  }
  for (const skip of scn?.skipErrors || []) {
    const msg = normalizeFailReason(skip);
    if (msg) return msg;
  }
  return '（未提供错误信息）';
}

function scenarioKey(spec, scn) {
  let file = String(spec?.fileName || '').trim();
  if (!file) file = String(spec?.id || '').trim();
  let name = String(scn?.heading || '').trim();
  if (!name) name = String(scn?.id || '').trim();
  const row = Number(scn?.tableRowIndex) || 0;
  const scnRow = Number(scn?.scenarioTableRowIndex) || 0;
  return `${file}\0${name}\0${row}\0${scnRow}`;
}

function unwrapReport(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.report && typeof payload.report === 'object') return payload.report;
  if (Array.isArray(payload.specs)) return payload;
  return null;
}

/**
 * @param {object|null} reportOrSnapshot
 * @returns {Array<object>}
 */
function scenarioLitesFromReport(reportOrSnapshot) {
  const report = unwrapReport(reportOrSnapshot);
  if (!report) return [];
  const out = [];
  for (const sp of report.specs || []) {
    let specName = String(sp?.heading || '').trim();
    if (!specName) specName = String(sp?.fileName || '').trim();
    if (!specName) specName = String(sp?.id || '');
    for (const scn of sp?.scenarios || []) {
      let scnName = String(scn?.heading || '').trim();
      if (!scnName) scnName = String(scn?.id || '');
      const verdict = String(scn?.verdict || '');
      const lite = {
        key: scenarioKey(sp, scn),
        specId: String(sp?.id || ''),
        specName,
        specFile: String(sp?.fileName || ''),
        scnId: String(scn?.id || ''),
        scnName,
        verdict,
        tableRowIndex: Number(scn?.tableRowIndex) || 0,
        scenarioTableRowIndex: Number(scn?.scenarioTableRowIndex) || 0,
      };
      if (verdict === 'fail') {
        lite.failReason = scenarioPrimaryFailReason(scn);
      }
      out.push(lite);
    }
  }
  return out;
}

function isFail(v) {
  return v === 'fail';
}

function classifyScenarioDiff(base, target) {
  if (!base && target) return 'added';
  if (base && !target) return 'removed';
  if (!base || !target) return 'verdict_changed';
  if (base.verdict === target.verdict) {
    if (isFail(base.verdict) && (base.failReason || '') !== (target.failReason || '')) {
      return 'reason_changed';
    }
    return '';
  }
  if (!isFail(base.verdict) && isFail(target.verdict)) return 'regressed';
  if (isFail(base.verdict) && !isFail(target.verdict)) return 'fixed';
  return 'verdict_changed';
}

const DIFF_ORDER = {
  regressed: 0,
  reason_changed: 1,
  verdict_changed: 2,
  added: 3,
  removed: 4,
  fixed: 5,
};

function sortScenarioDiffs(changed) {
  changed.sort((a, b) => {
    const oi = DIFF_ORDER[a.kind] ?? 9;
    const oj = DIFF_ORDER[b.kind] ?? 9;
    if (oi !== oj) return oi - oj;
    if (a.specName !== b.specName) return a.specName < b.specName ? -1 : 1;
    return a.scnName < b.scnName ? -1 : a.scnName > b.scnName ? 1 : 0;
  });
  return changed;
}

/**
 * @param {Array<object>} base
 * @param {Array<object>} target
 */
function compareScenarios(base, target) {
  const baseList = Array.isArray(base) ? base : [];
  const targetList = Array.isArray(target) ? target : [];
  const baseMap = new Map(baseList.map((s) => [s.key, s]));
  const targetMap = new Map(targetList.map((s) => [s.key, s]));
  const keys = new Set([...baseMap.keys(), ...targetMap.keys()]);
  const changed = [];
  let unchangedCount = 0;
  for (const key of keys) {
    const b = baseMap.get(key) || null;
    const t = targetMap.get(key) || null;
    const kind = classifyScenarioDiff(b, t);
    if (!kind) {
      unchangedCount += 1;
      continue;
    }
    changed.push({
      key,
      kind,
      specName: (b || t).specName || '',
      scnName: (b || t).scnName || '',
      baseVerdict: b?.verdict || '',
      targetVerdict: t?.verdict || '',
      baseReason: b?.failReason || '',
      targetReason: t?.failReason || '',
    });
  }
  sortScenarioDiffs(changed);
  return {
    changed,
    unchangedCount,
    baseCount: baseList.length,
    targetCount: targetList.length,
  };
}

function invertScenarioCompare(cmp) {
  const changed = (cmp?.changed || []).map((d) => {
    let kind = d.kind;
    if (kind === 'added') kind = 'removed';
    else if (kind === 'removed') kind = 'added';
    else if (kind === 'regressed') kind = 'fixed';
    else if (kind === 'fixed') kind = 'regressed';
    return {
      key: d.key,
      kind,
      specName: d.specName,
      scnName: d.scnName,
      baseVerdict: d.targetVerdict || '',
      targetVerdict: d.baseVerdict || '',
      baseReason: d.targetReason || '',
      targetReason: d.baseReason || '',
    };
  });
  sortScenarioDiffs(changed);
  return {
    changed,
    unchangedCount: Number(cmp?.unchangedCount) || 0,
    baseCount: Number(cmp?.targetCount) || 0,
    targetCount: Number(cmp?.baseCount) || 0,
  };
}

function loadReportSnapshot(reportDir) {
  if (!reportDir) return null;
  const jsonPath = path.join(reportDir, 'report.json');
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} baseDir
 * @param {string} targetDir
 */
function compareScenarioReportsFromDirs(baseDir, targetDir) {
  const baseSnap = loadReportSnapshot(baseDir);
  const targetSnap = loadReportSnapshot(targetDir);
  const missing = [];
  if (!baseSnap) missing.push('base');
  if (!targetSnap) missing.push('target');
  if (missing.length) {
    return {
      ok: false,
      missing,
      compare: { changed: [], unchangedCount: 0, baseCount: 0, targetCount: 0 },
    };
  }
  return {
    ok: true,
    missing: [],
    compare: compareScenarios(
      scenarioLitesFromReport(baseSnap),
      scenarioLitesFromReport(targetSnap),
    ),
  };
}

const KIND_LABELS = {
  regressed: '变差',
  fixed: '修复',
  added: '新增',
  removed: '消失',
  reason_changed: '原因变化',
  verdict_changed: '结论变化',
};

function scenarioDiffKindLabel(kind) {
  return KIND_LABELS[kind] || kind || '—';
}

module.exports = {
  normalizeFailReason,
  scenarioPrimaryFailReason,
  scenarioKey,
  scenarioLitesFromReport,
  compareScenarios,
  invertScenarioCompare,
  loadReportSnapshot,
  compareScenarioReportsFromDirs,
  scenarioDiffKindLabel,
};
