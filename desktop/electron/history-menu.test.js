'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  HISTORY_CONTEXT_ACTIONS,
  historyContextMenuItems,
  popupHistoryContextMenu,
} = require('./history-menu.js');

describe('history-menu', () => {
  it('exposes open / copy-open / reveal / copy-path actions', () => {
    const ids = HISTORY_CONTEXT_ACTIONS.filter((x) => x.id).map((x) => x.id);
    assert.deepEqual(ids, ['open', 'copy-open', 'reveal', 'copy-path']);
    const items = historyContextMenuItems();
    assert.notEqual(items, HISTORY_CONTEXT_ACTIONS);
    assert.equal(items[0].label, '打开报告');
    assert.equal(items.some((x) => x.type === 'separator'), true);
  });

  it('popupHistoryContextMenu resolves chosen action', async () => {
    const clicks = [];
    const fakeMenu = {
      buildFromTemplate(template) {
        clicks.push(...template.filter((t) => t.click).map((t) => t.label));
        return {
          popup(opts) {
            // simulate choosing "复制打开深链"
            const item = template.find((t) => t.label === '复制打开深链');
            item.click();
            if (typeof opts.callback === 'function') opts.callback();
          },
        };
      },
    };
    const result = await popupHistoryContextMenu(fakeMenu, null, { x: 10, y: 20 });
    assert.equal(result.action, 'copy-open');
    assert.ok(clicks.includes('复制打开深链'));
  });

  it('popupHistoryContextMenu dismisses when nothing chosen', async () => {
    const fakeMenu = {
      buildFromTemplate() {
        return {
          popup(opts) {
            opts.callback();
          },
        };
      },
    };
    const result = await popupHistoryContextMenu(fakeMenu, null, {});
    assert.equal(result.action, 'dismiss');
  });
});
