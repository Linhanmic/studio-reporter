'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  lastGenerated: null,
  countdown: null,
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
  let left = 5;
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
})();
