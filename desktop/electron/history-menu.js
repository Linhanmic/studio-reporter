'use strict';

/**
 * History row context-menu actions (renderer ↔ main).
 * Keep labels/actions pure so unit tests don't need Electron.
 */

const HISTORY_CONTEXT_ACTIONS = [
  { id: 'open', label: '打开报告' },
  { id: 'paste-focus', label: '粘贴摘要定位到此运行' },
  { id: 'copy-open', label: '复制打开深链' },
  { type: 'separator' },
  { id: 'reveal', label: '在文件夹中显示' },
  { id: 'copy-path', label: '复制路径' },
];

/**
 * @returns {Array<{id?: string, label?: string, type?: string}>}
 */
function historyContextMenuItems() {
  return HISTORY_CONTEXT_ACTIONS.map((item) => ({ ...item }));
}

/**
 * Popup a native context menu and resolve with the chosen action id.
 * @param {import('electron').Menu} Menu
 * @param {import('electron').BrowserWindow|null} win
 * @param {{ x?: number, y?: number }} [opts]
 * @returns {Promise<{action: string}>}
 */
function popupHistoryContextMenu(Menu, win, opts = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (action) => {
      if (settled) return;
      settled = true;
      resolve({ action: String(action || 'dismiss') });
    };
    const template = historyContextMenuItems().map((item) => {
      if (item.type === 'separator') return { type: 'separator' };
      return {
        label: item.label,
        click: () => done(item.id),
      };
    });
    const menu = Menu.buildFromTemplate(template);
    const x = Number(opts.x);
    const y = Number(opts.y);
    menu.popup({
      window: win || undefined,
      x: Number.isFinite(x) ? Math.round(x) : undefined,
      y: Number.isFinite(y) ? Math.round(y) : undefined,
      callback: () => done('dismiss'),
    });
  });
}

module.exports = {
  HISTORY_CONTEXT_ACTIONS,
  historyContextMenuItems,
  popupHistoryContextMenu,
};
