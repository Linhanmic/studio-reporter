'use strict';

const $ = (id) => document.getElementById(id);

const state = {
  lastGenerated: null,
  countdown: null,
  settings: null,
  jumpSeconds: 5,
  autoJump: true,
  historyRuns: [],
  selectedIds: [],
  discoverTimer: null,
  pluginInstall: null,
  outline: null,
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
  const hideChrome = name === 'history' || name === 'settings';
  $('connectBar').classList.toggle('hidden', hideChrome);
  $('runBar').classList.toggle('hidden', hideChrome);
  if (hideChrome) {
    $('gaugeLog').classList.add('hidden');
    $('sessionBar').classList.add('hidden');
  }
  if (name === 'history') refreshHistory();
  if (name === 'settings') {
    fillSettingsForm();
    refreshPluginDetect();
  }
}

function setStatus(text, kind) {
  const el = $('connStatus');
  el.textContent = text;
  el.classList.remove('ok', 'warn', 'error');
  if (kind) el.classList.add(kind);
}

function showLive(url) {
  $('liveFrame').src = url;
  $('liveEmpty').classList.add('hidden');
}

function postSelectToLive(id) {
  if (!id) return;
  const frame = $('liveFrame');
  try {
    frame.contentWindow?.postMessage(
      { type: 'studio-reporter:select-node', id },
      '*'
    );
  } catch {
    /* cross-origin or not ready */
  }
}

function verdictChip(verdict) {
  const v = String(verdict || '').toLowerCase();
  if (!v) return '';
  const cls = v === 'pass' || v === 'fail' || v === 'skip' ? v : '';
  return `<span class="outline-verdict ${cls}">${escapeHtml(v)}</span>`;
}

function renderOutline(outline) {
  state.outline = outline || null;
  const meta = $('outlineMeta');
  const tree = $('outlineTree');
  if (!meta || !tree) return;
  if (!outline || !outline.specs?.length) {
    meta.textContent = outline?.running ? '运行中…' : '等待快照…';
    tree.innerHTML = '<div class="outline-empty">连接并运行后显示规格书 / 场景大纲</div>';
    return;
  }
  const parts = [];
  if (outline.projectName) parts.push(outline.projectName);
  if (outline.running) parts.push('live');
  if (outline.rev != null) parts.push(`rev ${outline.rev}`);
  meta.textContent = parts.join(' · ') || '大纲';
  tree.innerHTML = outline.specs.map((spec) => {
    const specCurrent = spec.id && spec.id === outline.currentSpecId ? ' current' : '';
    const scnHtml = (spec.scenarios || []).map((scn) => {
      const scnCurrent = scn.id && scn.id === outline.currentScenarioId ? ' current' : '';
      return `<button type="button" class="outline-scn${scnCurrent}" data-node-id="${escapeHtml(scn.id)}">${verdictChip(scn.verdict)}${escapeHtml(scn.heading || scn.id)}</button>`;
    }).join('');
    return `<button type="button" class="outline-spec${specCurrent}" data-node-id="${escapeHtml(spec.id)}">${verdictChip(spec.verdict)}${escapeHtml(spec.heading || spec.fileName || spec.id)}</button>${scnHtml}`;
  }).join('');
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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function verdictClass(v) {
  if (v === 'pass') return 'ok';
  if (v === 'fail') return 'warn';
  return '';
}

function deltaClass(ms) {
  if (ms > 0) return 'delta-up';
  if (ms < 0) return 'delta-down';
  return 'delta-same';
}

function updateCompareButton() {
  const n = state.selectedIds.length;
  const btn = $('btnCompareRuns');
  btn.disabled = n !== 2;
  btn.textContent = `对比所选（${n}/2）`;
}

function toggleSelect(id, checked) {
  if (checked) {
    if (!state.selectedIds.includes(id)) state.selectedIds.push(id);
    while (state.selectedIds.length > 2) {
      const dropped = state.selectedIds.shift();
      const box = document.querySelector(`input.pick[data-id="${CSS.escape(dropped)}"]`);
      if (box) box.checked = false;
    }
  } else {
    state.selectedIds = state.selectedIds.filter((x) => x !== id);
  }
  updateCompareButton();
}

function renderCompare(cmp) {
  const panel = $('comparePanel');
  panel.classList.remove('hidden');
  const vText = cmp.verdictSame
    ? `结论相同（${cmp.base.verdict || '—'}）`
    : `结论变化：${cmp.base.verdict || '—'} → ${cmp.target.verdict || '—'}`;
  panel.innerHTML = `
    <h3>对比 ${escapeHtml(cmp.base.id || 'base')} → ${escapeHtml(cmp.target.id || 'target')}</h3>
    <div class="compare-grid">
      <div>${escapeHtml(vText)}</div>
      <div class="${deltaClass(cmp.durationMs.delta)}">时长 ${escapeHtml(window.desktopAPI.formatDurationDelta(cmp.durationMs.delta))}</div>
      <div>规格书 ${escapeHtml(window.desktopAPI.formatCountsDelta(cmp.specs))}</div>
      <div>场景 ${escapeHtml(window.desktopAPI.formatCountsDelta(cmp.scenarios))}</div>
      <div>步骤 ${escapeHtml(window.desktopAPI.formatCountsDelta(cmp.steps))}</div>
    </div>
  `;
}

function runCompare() {
  if (state.selectedIds.length !== 2) return;
  const [baseId, targetId] = state.selectedIds;
  const base = state.historyRuns.find((r) => r.id === baseId);
  const target = state.historyRuns.find((r) => r.id === targetId);
  if (!base || !target) {
    setStatus('所选运行已不存在，请刷新历史', 'warn');
    return;
  }
  renderCompare(window.desktopAPI.compareHistoryRuns(base, target));
}

async function refreshHistory() {
  const list = $('historyList');
  const empty = $('historyEmpty');
  list.innerHTML = '';
  state.selectedIds = [];
  updateCompareButton();
  $('comparePanel').classList.add('hidden');
  try {
    const hist = await window.desktopAPI.listHistory();
    state.historyRuns = hist.runs || [];
    $('historyMeta').textContent = hist.hubDir
      ? `${hist.hubDir} · ${state.historyRuns.length} 次运行`
      : '未设置报告根目录';
    if (!state.historyRuns.length) {
      empty.classList.remove('hidden');
      empty.querySelector('p').textContent = hist.error || '暂无历史运行';
      return;
    }
    empty.classList.add('hidden');
    state.historyRuns.forEach((run, idx) => {
      const id = run.id || run.href || run.relDir || `run-${idx}`;
      run.id = id;
      const row = document.createElement('div');
      row.className = 'history-row';
      row.innerHTML = `
        <input class="pick" type="checkbox" data-id="${escapeHtml(id)}" title="勾选以对比">
        <span class="verdict ${verdictClass(run.verdict)}">${escapeHtml(run.verdict || '—')}</span>
        <span class="hist-main">
          <strong>${escapeHtml(run.projectName || id)}</strong>
          <span class="muted">${escapeHtml(run.timestamp || run.timestampISO || '')}</span>
        </span>
        <span class="muted">${escapeHtml(run.duration || '')}</span>
      `;
      const open = async () => {
        try {
          await window.desktopAPI.openHistoryRun(run);
          setTab('report');
        } catch (err) {
          setStatus(String(err.message || err), 'warn');
        }
      };
      row.querySelector('.hist-main').addEventListener('click', open);
      row.querySelector('.verdict').addEventListener('click', open);
      row.querySelector('.pick').addEventListener('change', (e) => {
        toggleSelect(id, e.target.checked);
      });
      list.appendChild(row);
    });
  } catch (err) {
    empty.classList.remove('hidden');
    setStatus(String(err.message || err), 'warn');
  }
}

function fillRecentProjects(list) {
  const dl = $('recentProjectsList');
  if (!dl) return;
  dl.innerHTML = '';
  (list || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p;
    dl.appendChild(opt);
  });
}

function renderSessions(payload) {
  const bar = $('sessionBar');
  if (!bar) return;
  const sessions = payload?.sessions || [];
  const activeId = payload?.activeId || null;
  if (!sessions.length) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  bar.classList.remove('hidden');
  bar.innerHTML = sessions.map((s) => {
    const active = s.id === activeId ? ' active' : '';
    const status = s.status === 'running' ? '运行中' : (s.exitCode ? `退出 ${s.exitCode}` : '结束');
    return `<button type="button" class="session-chip${active}" data-session-id="${s.id}" title="${s.projectDir}">
      <strong>${s.projectName || s.id}</strong>
      <span class="muted">${status}</span>
    </button>`;
  }).join('');
  bar.querySelectorAll('.session-chip').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const session = await window.desktopAPI.setActiveSession(btn.dataset.sessionId);
        if (session?.discoveredUrl) $('wsInput').value = session.discoveredUrl;
        setStatus(`已切换会话 ${session?.projectName || ''}`, 'ok');
      } catch (err) {
        setStatus(String(err.message || err), 'warn');
      }
    });
  });
}

function fillSettingsForm() {
  const s = state.settings || {};
  $('settingHubDir').value = s.reportHubDir || '';
  $('settingAutoJump').checked = s.autoJumpToReport !== false;
  $('settingJumpSeconds').value = s.autoJumpSeconds ?? 5;
  $('settingGaugeBin').value = s.gaugeBin || 'gauge';
  $('settingAutoCheckUpdates').checked = Boolean(s.autoCheckUpdates);
  $('gaugeProjectDir').value = s.gaugeProjectDir || $('gaugeProjectDir').value || '';
  $('gaugeSpecs').value = s.gaugeSpecs || $('gaugeSpecs').value || 'specs';
  $('gaugeEnv').value = s.gaugeEnv || '';
  fillRecentProjects(s.recentProjects || []);
}

function renderPluginDetect(info) {
  state.pluginInstall = info || null;
  const el = $('pluginDetectStatus');
  const hint = $('pluginDetectHint');
  if (!el || !hint) return;
  el.classList.remove('ok', 'warn', 'error', 'muted');
  if (!info) {
    el.textContent = '未检测';
    el.classList.add('muted');
    hint.textContent = '';
    return;
  }
  el.textContent = info.message || (info.found ? `v${info.version}` : '未安装');
  el.classList.add(info.level || (info.ok ? 'ok' : 'error'));
  if (info.path) {
    hint.textContent = info.path;
  } else if (!info.found) {
    hint.textContent = '请执行 gauge install studio-reporter --file <zip>，或解压到 ~/.gauge/plugins/studio-reporter/<version>/';
  } else {
    hint.textContent = '';
  }
}

async function refreshPluginDetect() {
  const el = $('pluginDetectStatus');
  if (el) {
    el.classList.remove('ok', 'warn', 'error');
    el.classList.add('muted');
    el.textContent = '检测中…';
  }
  try {
    const info = await window.desktopAPI.detectPlugin();
    renderPluginDetect(info);
    return info;
  } catch (err) {
    renderPluginDetect({
      found: false,
      ok: false,
      level: 'error',
      message: String(err.message || err),
    });
    return null;
  }
}

function renderUpdaterStatus(status) {
  const el = $('updaterStatus');
  const installBtn = $('btnQuitInstall');
  if (!el) return;
  el.classList.remove('ok', 'warn', 'error', 'muted');
  if (!status) {
    el.textContent = '尚未检查';
    el.classList.add('muted');
    installBtn?.classList.add('hidden');
    return;
  }
  el.textContent = status.message || status.state || '';
  if (status.state === 'current' || status.state === 'ready') el.classList.add('ok');
  else if (status.state === 'error') el.classList.add('error');
  else if (status.state === 'available' || status.state === 'downloading' || status.state === 'checking') {
    el.classList.add('warn');
  } else el.classList.add('muted');
  if (installBtn) {
    installBtn.classList.toggle('hidden', status.state !== 'ready');
  }
}

async function checkUpdates() {
  renderUpdaterStatus({ state: 'checking', message: '正在检查更新…' });
  try {
    const status = await window.desktopAPI.checkUpdates();
    renderUpdaterStatus(status);
    return status;
  } catch (err) {
    renderUpdaterStatus({ state: 'error', message: String(err.message || err) });
    return null;
  }
}

function clearDiscoverWatch() {
  if (state.discoverTimer) {
    clearTimeout(state.discoverTimer);
    state.discoverTimer = null;
  }
}

function watchDiscoverTimeout(ms = 20000) {
  clearDiscoverWatch();
  state.discoverTimer = setTimeout(async () => {
    state.discoverTimer = null;
    const info = state.pluginInstall || await refreshPluginDetect();
    if (!info?.found) {
      setStatus('超时未发现 websocket：请检查是否已安装 studio-reporter 插件（见设置）', 'warn');
    } else if (!info.ok) {
      setStatus(`超时未发现 websocket：本机插件 ${info.version} 可能过旧`, 'warn');
    } else {
      setStatus('超时未发现 websocket：确认项目已启用 studio-reporter 报告插件', 'warn');
    }
  }, ms);
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
    gaugeBin: $('settingGaugeBin').value.trim() || 'gauge',
    gaugeProjectDir: $('gaugeProjectDir').value.trim(),
    gaugeSpecs: $('gaugeSpecs').value.trim() || 'specs',
    gaugeEnv: $('gaugeEnv').value.trim(),
    autoCheckUpdates: $('settingAutoCheckUpdates').checked,
  };
  state.settings = await window.desktopAPI.saveSettings(partial);
  state.autoJump = state.settings.autoJumpToReport;
  state.jumpSeconds = state.settings.autoJumpSeconds;
  $('settingsStatus').textContent = '已保存';
  setTimeout(() => { $('settingsStatus').textContent = ''; }, 1500);
}

function appendGaugeLog(text) {
  const el = $('gaugeLog');
  el.classList.remove('hidden');
  el.textContent += text;
  if (el.textContent.length > 200_000) {
    el.textContent = el.textContent.slice(-150_000);
  }
  el.scrollTop = el.scrollHeight;
}

function setGaugeRunning(runningCountOrBool) {
  const running = typeof runningCountOrBool === 'number'
    ? runningCountOrBool > 0
    : Boolean(runningCountOrBool);
  // Multi-session: allow starting another run while one is active (cap enforced in main).
  $('btnStartGauge').disabled = false;
  $('btnStopGauge').disabled = !running;
  $('btnPickGaugeProject').disabled = false;
}

async function startGauge() {
  const projectDir = $('gaugeProjectDir').value.trim();
  if (!projectDir) {
    setStatus('请先选择 Gauge 项目目录', 'warn');
    return;
  }
  $('gaugeLog').textContent = '';
  $('gaugeLog').classList.remove('hidden');
  setGaugeRunning(true);
  try {
    await window.desktopAPI.startGauge({
      projectDir,
      specs: $('gaugeSpecs').value.trim() || 'specs',
      env: $('gaugeEnv').value.trim(),
      gaugeBin: $('settingGaugeBin').value.trim() || state.settings?.gaugeBin || 'gauge',
    });
    setStatus('Gauge 已启动，等待 discover…', 'ok');
    watchDiscoverTimeout(20000);
    setTab('run');
  } catch (err) {
    setGaugeRunning(false);
    clearDiscoverWatch();
    setStatus(String(err.message || err), 'warn');
  }
}

async function stopGauge() {
  try {
    clearDiscoverWatch();
    await window.desktopAPI.stopGauge();
    setStatus('正在停止 Gauge…', 'warn');
  } catch (err) {
    setStatus(String(err.message || err), 'warn');
  }
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
  $('btnCompareRuns').addEventListener('click', runCompare);
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
  $('btnRefreshPlugin')?.addEventListener('click', () => {
    refreshPluginDetect();
  });
  $('btnCheckUpdates')?.addEventListener('click', () => {
    checkUpdates();
  });
  $('btnQuitInstall')?.addEventListener('click', async () => {
    try {
      await window.desktopAPI.quitAndInstall();
    } catch (err) {
      setStatus(String(err.message || err), 'warn');
    }
  });
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

  $('btnPickGaugeProject').addEventListener('click', async () => {
    const dir = await window.desktopAPI.pickGaugeProject();
    if (dir) {
      $('gaugeProjectDir').value = dir;
      await loadSettings();
    }
  });
  $('btnStartGauge').addEventListener('click', startGauge);
  $('btnStopGauge').addEventListener('click', stopGauge);

  window.desktopAPI.onBridgeStatus((data) => {
    if (data?.compat) {
      const level = data.compat.level === 'error' ? 'error' : data.compat.ok ? 'ok' : 'warn';
      setStatus(data.compat.message || `插件 ${data.compat.version || ''}`, level);
      return;
    }
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
  window.desktopAPI.onReportOutline((outline) => {
    renderOutline(outline);
  });
  $('outlineTree')?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-node-id]');
    if (!btn) return;
    postSelectToLive(btn.getAttribute('data-node-id'));
  });
  window.desktopAPI.onGaugeLog((data) => {
    if (data?.text) appendGaugeLog(data.text);
  });
  window.desktopAPI.onGaugeDiscover((data) => {
    if (data?.url) {
      clearDiscoverWatch();
      $('wsInput').value = data.url;
      setStatus(`已发现 ${data.url}，正在连接…`, 'ok');
    }
  });
  window.desktopAPI.onGaugeStatus((data) => {
    if (!data) return;
    if (data.sessions) renderSessions(data);
    const runningN = (data.sessions || []).filter((s) => s.status === 'running').length;
    setGaugeRunning(runningN > 0 || Boolean(data.running));
    if (data.autoConnected && data.liveUrl) {
      clearDiscoverWatch();
      showLive(data.liveUrl);
      setTab('run');
      setStatus(`已自动连接 ${data.discoveredUrl || ''}`.trim(), 'ok');
      $('btnDisconnect').disabled = false;
      fillRecentProjects(state.settings?.recentProjects || []);
    } else if (data.running === false) {
      clearDiscoverWatch();
      const code = data.code != null ? ` code=${data.code}` : '';
      setStatus(`Gauge 已退出${code}`, data.code ? 'warn' : 'ok');
    } else if (data.error) {
      setStatus(data.error, 'warn');
    }
  });
  window.desktopAPI.onSessionsUpdated((data) => {
    renderSessions(data || {});
    const runningN = (data?.sessions || []).filter((s) => s.status === 'running').length;
    setGaugeRunning(runningN);
  });
  window.desktopAPI.onUpdaterStatus((data) => {
    renderUpdaterStatus(data);
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
  try {
    await refreshPluginDetect();
  } catch {
    /* ignore */
  }
  try {
    const st = await window.desktopAPI.getUpdaterStatus();
    renderUpdaterStatus(st);
  } catch {
    /* ignore */
  }
  try {
    const sess = await window.desktopAPI.listSessions();
    renderSessions(sess || {});
  } catch {
    /* ignore */
  }
})();
