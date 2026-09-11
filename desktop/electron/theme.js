'use strict';

const THEMES = ['system', 'light', 'dark'];

/**
 * Normalize a stored theme preference.
 * @param {unknown} value
 * @returns {'system'|'light'|'dark'}
 */
function normalizeTheme(value) {
  const v = String(value || 'system').toLowerCase();
  return THEMES.includes(v) ? v : 'system';
}

/**
 * Resolve preference + OS preference into an effective theme.
 * @param {unknown} preference
 * @param {boolean} prefersDark
 * @returns {'light'|'dark'}
 */
function resolveTheme(preference, prefersDark) {
  const pref = normalizeTheme(preference);
  if (pref === 'light' || pref === 'dark') return pref;
  return prefersDark ? 'dark' : 'light';
}

module.exports = {
  THEMES,
  normalizeTheme,
  resolveTheme,
};
