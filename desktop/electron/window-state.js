'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 840;
const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;

function windowStatePath(userDataDir) {
  return path.join(userDataDir, 'window-state.json');
}

function defaultWindowState() {
  return {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    x: undefined,
    y: undefined,
    isMaximized: false,
  };
}

/**
 * Coerce raw JSON into a safe window state object.
 * @param {unknown} raw
 */
function normalizeWindowState(raw) {
  const fallback = defaultWindowState();
  if (!raw || typeof raw !== 'object') return fallback;
  const width = Number(/** @type {{width?: unknown}} */ (raw).width);
  const height = Number(/** @type {{height?: unknown}} */ (raw).height);
  const x = Number(/** @type {{x?: unknown}} */ (raw).x);
  const y = Number(/** @type {{y?: unknown}} */ (raw).y);
  return {
    width:
      Number.isFinite(width) && width >= MIN_WIDTH
        ? Math.round(width)
        : fallback.width,
    height:
      Number.isFinite(height) && height >= MIN_HEIGHT
        ? Math.round(height)
        : fallback.height,
    x: Number.isFinite(x) ? Math.round(x) : undefined,
    y: Number.isFinite(y) ? Math.round(y) : undefined,
    isMaximized: Boolean(/** @type {{isMaximized?: unknown}} */ (raw).isMaximized),
  };
}

/**
 * Keep the window on a visible display work area.
 * @param {{x?: number, y?: number, width: number, height: number, isMaximized?: boolean}} state
 * @param {Array<{x: number, y: number, width: number, height: number}>} workAreas
 */
function sanitizeWindowState(state, workAreas) {
  const base = normalizeWindowState(state);
  const areas =
    Array.isArray(workAreas) && workAreas.length
      ? workAreas
      : [{ x: 0, y: 0, width: 1920, height: 1080 }];
  const primary = areas[0];

  if (base.x === undefined || base.y === undefined) {
    return {
      ...base,
      width: Math.min(base.width, Math.max(MIN_WIDTH, primary.width)),
      height: Math.min(base.height, Math.max(MIN_HEIGHT, primary.height)),
      x: undefined,
      y: undefined,
    };
  }

  const margin = 40;
  const visible = areas.some((area) => {
    const overlapX = Math.max(
      0,
      Math.min(base.x + base.width, area.x + area.width) - Math.max(base.x, area.x)
    );
    const overlapY = Math.max(
      0,
      Math.min(base.y + base.height, area.y + area.height) - Math.max(base.y, area.y)
    );
    return overlapX >= margin && overlapY >= margin;
  });

  if (visible) return base;

  const width = Math.min(base.width, Math.max(MIN_WIDTH, primary.width));
  const height = Math.min(base.height, Math.max(MIN_HEIGHT, primary.height));
  return {
    width,
    height,
    x: Math.round(primary.x + (primary.width - width) / 2),
    y: Math.round(primary.y + (primary.height - height) / 2),
    isMaximized: false,
  };
}

function loadWindowState(userDataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(windowStatePath(userDataDir), 'utf8'));
    return normalizeWindowState(raw);
  } catch {
    return defaultWindowState();
  }
}

function saveWindowState(userDataDir, state) {
  const next = normalizeWindowState(state);
  fs.mkdirSync(userDataDir, { recursive: true });
  const payload = {
    width: next.width,
    height: next.height,
    isMaximized: next.isMaximized,
  };
  if (next.x !== undefined) payload.x = next.x;
  if (next.y !== undefined) payload.y = next.y;
  fs.writeFileSync(windowStatePath(userDataDir), `${JSON.stringify(payload, null, 2)}\n`);
  return next;
}

/**
 * Capture state from an Electron BrowserWindow-like object.
 * When maximized, keep the previous normal bounds.
 * @param {{ isMaximized?: (() => boolean) | boolean, getBounds?: () => {x:number,y:number,width:number,height:number}, bounds?: object }} win
 * @param {object} [previous]
 */
function captureWindowState(win, previous) {
  const prev = normalizeWindowState(previous);
  const isMaximized =
    typeof win.isMaximized === 'function' ? win.isMaximized() : Boolean(win.isMaximized);
  if (isMaximized) {
    return { ...prev, isMaximized: true };
  }
  const bounds = typeof win.getBounds === 'function' ? win.getBounds() : win.bounds || {};
  return normalizeWindowState({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: false,
  });
}

/**
 * Build BrowserWindow constructor options from sanitized state.
 * @param {ReturnType<typeof sanitizeWindowState>} state
 */
function browserWindowOptionsFromState(state) {
  const opts = {
    width: state.width,
    height: state.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
  };
  if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
    opts.x = state.x;
    opts.y = state.y;
  }
  return opts;
}

module.exports = {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  MIN_WIDTH,
  MIN_HEIGHT,
  windowStatePath,
  defaultWindowState,
  normalizeWindowState,
  sanitizeWindowState,
  loadWindowState,
  saveWindowState,
  captureWindowState,
  browserWindowOptionsFromState,
};
