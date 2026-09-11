'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  lastGenerated: null,
  countdown: null,
  settings: null,
  jumpSeconds: 5,
  autoJump: true,
};

function setTab(name) {
  document.querySelectorAll('.tab').forEach((btn) => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === `pane-${name}`);
  });
  $('connectBar').classList.toggle('hidden', name === 'history' || name === 'settings');
  if (name === 'history') refreshHistory();
  if (name === 'settings') fillSettingsForm();
}

function setStatus(text, kind) {
  const el = $('connStatus');
  el.textContent = text;
  el.classList.remove('ok', 'warn');
  if (kind) el.classList.add(kind);
}

function showLive(url) {
  $('liveFrame').src = url;
  $('liveEmpty').classList.add('hidden');
}

function showReport(url) {
  $('reportFrame').src = url;
  $('reportEmpty').classList.add('hidden');
  setTab('report');
}

function showEndBanner(payload) {
  state.lastGenerated = payload;
  $('endBannerText').textContent = payload?.reportPath
    ? `报告已生成：${payload.reportPath}`
    : '套件已结束，报告已生成';
  $('endBanner').classList.remove('hidden');
  clearInterval(state.countdown);
  if (!state.autoJump) {
    $('btnOpenFinal').textContent = '打开终态报告';
    return;
  }
  let left = state.jumpSeconds;
  const tick = () => {
    $('btnOpenFinal').textContent = left > 0 ? `打开终态报告（${left}）` : '打开终态报告';
    if (left <= 0) {
      clearInterval(state.countdown);
      state.countdown = null;
      openFinal();
      return;
    }
    left -= 1;
  };
  tick();
  state.countdown = setInterval(tick, 1000);
}

async function openFinal() {
  clearInterval(state.countdown);
  state.countdown = null;
  $('btnOpenFinal').textContent = '打开终态报告';
  const payload = state.lastGenerated;
  if (!payload) return;
  try {
    await window.desktopAPI.openReportPath(payload.reportPath || payload.reportDir);
    $('endBanner').classList.add('hidden');
    refreshHistory();
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
}

async function connect() {
  const input = $('wsInput').value;
  $('btnConnect').disabled = true;
  try {
    const { liveUrl, url } = await window.desktopAPI.connectWs(input);
    $('btnDisconnect').disabled = false;
    setStatus(`已连接 ${url}`, 'ok');
    showLive(liveUrl);
    setTab('run');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  } finally {
    $('btnConnect').disabled = false;
  }
}

async function disconnect() {
  await window.desktopAPI.disconnect();
  $('btnDisconnect').disabled = true;
  setStatus('未连接');
}

function verdictClass(v) {
  if (v === 'pass') return 'ok';
  if (v === 'fail') return 'warn';
  return '';
}

async function refreshHistory() {
  const list = $('historyList');
  const empty = $('historyEmpty');
  list.innerHTML = '';
  try {
    const hist = await window.desktopAPI.listHistory();
    $('historyMeta').textContent = hist.hubDir
      ? `${hist.hubDir} · ${hist.runs.length} 次运行`
      : '未设置报告根目录';
    if (!hist.runs.length) {
      empty.classList.remove('hidden');
      empty.querySelector('p').textContent = hist.error || '暂无历史运行';
      return;
    }
    empty.classList.add('hidden');
    hist.runs.forEach((run) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'history-row';
      row.innerHTML = `
        <span class="verdict ${verdictClass(run.verdict)}">${run.verdict || '—'}</span>
        <span class="hist-main">
          <strong>${run.projectName || run.id || 'run'}</strong>
          <span class="muted">${run.timestamp || run.timestampISO || ''}</span>
        </span>
        <span class="muted">${run.duration || ''}</span>
      `;
      row.addEventListener('click', async () => {
        try {
          await window.desktopAPI.openHistoryRun(run);
          setTab('report');
        } catch (err) {
          setStatus(String(err.message || err), 'warn');
        }
      });
      list.appendChild(row);
    });
  } catch (err) {
    empty.classList.remove('hidden');
    setStatus(String(err.message || err), 'warn');
  }
}

function fillSettingsForm() {
  const s = state.settings || {};
  $('settingHubDir').value = s.reportHubDir || '';
  $('settingAutoJump').checked = s.autoJumpToReport !== false;
  $('settingJumpSeconds').value = s.autoJumpSeconds ?? 5;
}

async function loadSettings() {
  state.settings = await window.desktopAPI.getSettings();
  state.autoJump = state.settings.autoJumpToReport !== false;
  state.jumpSeconds = Number(state.settings.autoJumpSeconds ?? 5);
  fillSettingsForm();
}

async function saveSettings() {
  const partial = {
    reportHubDir: $('settingHubDir').value.trim(),
    autoJumpToReport: $('settingAutoJump').checked,
    autoJumpSeconds: Number($('settingJumpSeconds').value) || 0,
  };
  state.settings = await window.desktopAPI.saveSettings(partial);
  state.autoJump = state.settings.autoJumpToReport;
  state.jumpSeconds = state.settings.autoJumpSeconds;
  $('settingsStatus').textContent = '已保存';
  setTimeout(() => { $('settingsStatus').textContent = ''; }, 1500);
}

function wire() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
  $('btnConnect').addEventListener('click', connect);
  $('btnDisconnect').addEventListener('click', disconnect);
  $('btnOpenDir').addEventListener('click', async () => {
    const dir = await window.desktopAPI.pickReportDir();
    if (dir) setStatus(`已打开 ${dir}`, 'ok');
  });
  $('btnOpenFinal').addEventListener('click', openFinal);
  $('btnDismissBanner').addEventListener('click', () => {
    clearInterval(state.countdown);
    state.countdown = null;
    $('endBanner').classList.add('hidden');
    $('btnOpenFinal').textContent = '打开终态报告';
  });
  $('wsInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') connect();
  });
  $('btnRefreshHistory').addEventListener('click', refreshHistory);
  $('btnPickHub').addEventListener('click', async () => {
    const hub = await window.desktopAPI.pickHubDir();
    if (hub) {
      await loadSettings();
      refreshHistory();
    }
  });
  $('btnSettingPickHub').addEventListener('click', async () => {
    const hub = await window.desktopAPI.pickHubDir();
    if (hub) {
      await loadSettings();
      fillSettingsForm();
    }
  });
  $('btnSaveSettings').addEventListener('click', saveSettings);
  $('btnExportPdf').addEventListener('click', async () => {
    try {
      await window.desktopAPI.exportReport('pdf');
      setStatus('PDF 导出完成', 'ok');
    } catch (err) {
      setStatus(String(err.message || err), 'warn');
    }
  });
  $('btnExportSingle').addEventListener('click', async () => {
    try {
      await window.desktopAPI.exportReport('single');
      setStatus('单文件 HTML 导出完成', 'ok');
    } catch (err) {
      setStatus(String(err.message || err), 'warn');
    }
  });

  window.desktopAPI.onBridgeStatus((data) => {
    if (data?.hello?.version) {
      setStatus(`已连接 · 插件 ${data.hello.version}`, 'ok');
      return;
    }
    if (data?.connected) setStatus(`已连接 ${data.url || ''}`.trim(), 'ok');
    else if (data?.error) setStatus(data.error, 'warn');
    else if (data && data.connected === false) setStatus('已断开', 'warn');
  });
  window.desktopAPI.onReportGenerated((payload) => showEndBanner(payload));
  window.desktopAPI.onNavigateLive((data) => {
    if (data?.url) {
      showLive(data.url);
      setTab('run');
    }
  });
  window.desktopAPI.onNavigateReport((data) => {
    if (data?.url) showReport(data.url);
  });
  window.desktopAPI.onSnapshotMeta((meta) => {
    if (!meta) return;
    if (meta.running === false) setStatus('运行结束（等待落盘）', 'warn');
    else if (meta.projectName) setStatus(`运行中 · ${meta.projectName}`, 'ok');
  });
}

(async function init() {
  wire();
  try {
    const info = await window.desktopAPI.info();
    $('version').textContent = `Desktop ${info.version}`;
  } catch {
    $('version').textContent = 'Desktop';
  }
  try {
    await loadSettings();
  } catch {
    /* ignore */
  }
})();
