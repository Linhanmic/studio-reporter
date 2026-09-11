'use strict';

const TAB_ORDER = ['run', 'report', 'history', 'settings'];

/**
 * Whether keyboard shortcuts should be ignored for this event target.
 * @param {Element|EventTarget|null|undefined} target
 */
function shouldIgnoreShortcutTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const el = /** @type {any} */ (target);
  const tag = String(el.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = String(el.type || 'text').toLowerCase();
    // Allow shortcuts in checkbox/button/radio; block text-like fields.
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file'].includes(type);
  }
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Map a keyboard event-like object to a desktop shortcut action.
 * @param {{key?: string, code?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean}} evt
 * @returns {{type: string, tab?: string}|null}
 */
function matchShortcut(evt = {}) {
  const key = String(evt.key || '');
  const code = String(evt.code || '');
  const mod = Boolean(evt.ctrlKey || evt.metaKey);
  const shift = Boolean(evt.shiftKey);
  const alt = Boolean(evt.altKey);

  if (key === 'F5' || code === 'F5') {
    return { type: 'refresh-history' };
  }

  if (!mod || alt) return null;

  if (key === '1' || code === 'Digit1') return { type: 'tab', tab: 'run' };
  if (key === '2' || code === 'Digit2') return { type: 'tab', tab: 'report' };
  if (key === '3' || code === 'Digit3') return { type: 'tab', tab: 'history' };
  if (key === '4' || code === 'Digit4') return { type: 'tab', tab: 'settings' };

  if ((key === 'Enter' || code === 'Enter') && !shift) {
    return { type: 'connect' };
  }

  const lower = key.toLowerCase();
  if ((lower === 'h' || code === 'KeyH') && shift) {
    return { type: 'refresh-history' };
  }
  if ((lower === 'o' || code === 'KeyO') && !shift) {
    // Handled by application menu in main; expose for tests / renderer parity.
    return { type: 'open-report' };
  }

  return null;
}

/**
 * Arrow-key navigation within a tablist.
 * @param {string} currentTab
 * @param {'ArrowLeft'|'ArrowRight'|'Home'|'End'|string} key
 */
function nextTab(currentTab, key) {
  const idx = Math.max(0, TAB_ORDER.indexOf(currentTab));
  if (key === 'Home') return TAB_ORDER[0];
  if (key === 'End') return TAB_ORDER[TAB_ORDER.length - 1];
  if (key === 'ArrowRight') return TAB_ORDER[(idx + 1) % TAB_ORDER.length];
  if (key === 'ArrowLeft') {
    return TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length];
  }
  return currentTab;
}

module.exports = {
  TAB_ORDER,
  shouldIgnoreShortcutTarget,
  matchShortcut,
  nextTab,
};
