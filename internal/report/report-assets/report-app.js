const rawSeed = JSON.parse(document.getElementById('report-data').textContent);
    const seededEnvelope = rawSeed && rawSeed.report ? rawSeed : { rev: 0, running: false, report: rawSeed };
    const seeded = JSON.parse(JSON.stringify(seededEnvelope.report || {}));
    // ?run=archives/<id> opens an archived run from the report hub (see manage.html).
    const runDir = (() => {
      try { return safeRelDir(new URLSearchParams(window.location.search).get('run') || ''); } catch (e) { return ''; }
    })();
    const assetHref = (p) => {
      p = String(p == null ? '' : p);
      if (!p || !runDir || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(p)) return p;
      return runDir + '/' + p;
    };
    const emptyCounts = () => ({ total: 0, passed: 0, failed: 0, skipped: 0 });
    const ensureReport = (r) => {
      r = r || {};
      r.summary = r.summary || {};
      r.summary.specs = r.summary.specs || emptyCounts();
      r.summary.scenarios = r.summary.scenarios || emptyCounts();
      r.summary.steps = r.summary.steps || emptyCounts();
      r.specs = r.specs || [];
      r.duration = r.duration || '00:00:00.000';
      r.projectName = r.projectName || 'Gauge Suite';
      return r;
    };

    const verdictLabel = (v) => ({ pass: '通过', fail: '失败', skip: '跳过', none: '—' })[v] || '—';
    const tagType = (v) => ({ pass: 'success', fail: 'danger', skip: 'info', none: 'info' })[v] || 'info';
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const itemText = (item) => {
      if (!item) return '';
      if (item.kind === 'comment') return item.comment || '';
      const step = item.step || (item.concept && item.concept.step);
      return (step && (step.actualText || step.parsedText)) || '';
    };
    const itemVerdict = (item) => {
      if (item.kind === 'step' && item.step) return item.step.verdict;
      if (item.kind === 'concept' && item.concept && item.concept.step) return item.concept.step.verdict;
      return 'none';
    };
    const stepHTML = (step) => {
      if (!step) return '';
      if (step.fragments && step.fragments.length) {
        return step.fragments.map((f) => {
          if (f.kind === 'text') return esc(f.text);
          if (f.kind === 'table') return '<span class="frag special">[table]</span>';
          if (f.kind === 'multiline') return '<pre class="stack">' + esc(f.text) + '</pre>';
          return '<span class="frag ' + esc(f.kind) + '">' + esc(f.text) + '</span>';
        }).join('');
      }
      return esc(step.actualText || step.parsedText || '');
    };
    const itemDuration = (item) => item.duration || (item.step && item.step.duration) || (item.concept && item.concept.duration) || '00:00:00.000';
    const itemTime = (item) => item.executionTime || (item.step && item.step.executionTime) || (item.concept && item.concept.executionTime) || 0;
    const formatDuration = (ms) => {
      ms = Math.max(0, ms || 0);
      const h = Math.floor(ms / 3600000);
      const m = Math.floor(ms / 60000) % 60;
      const s = (ms / 1000) - h * 3600 - m * 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + s.toFixed(3).padStart(6, '0');
    };
    const matchQuery = (q, texts) => {
      if (!q) return true;
      return texts.some((t) => String(t || '').toLowerCase().includes(q));
    };
    const walkItems = (items, fn) => {
      (items || []).forEach((item) => {
        fn(item);
        if (item.kind === 'concept' && item.concept) walkItems(item.concept.items, fn);
      });
    };
    const scenarioAllItems = (scn) => [].concat(scn.contexts || [], scn.items || [], scn.teardowns || []);
    const scenarioTexts = (scn) => {
      const texts = [scn.heading].concat(scn.tags || []);
      walkItems(scenarioAllItems(scn), (item) => texts.push(itemText(item)));
      return texts;
    };
    const specTexts = (spec) => {
      const texts = [spec.heading, spec.fileName].concat(spec.tags || []);
      (spec.scenarios || []).forEach((scn) => texts.push.apply(texts, scenarioTexts(scn)));
      return texts;
    };
    const itemHasDetail = (item) => {
      if (item.kind === 'concept' && item.concept && item.concept.items && item.concept.items.length) return true;
      const step = item.step || (item.concept && item.concept.step);
      if (!step) return !!item.comment;
      return !!(step.errorMessage || step.stackTrace || step.skippedReason || step.failureScreenshot || (step.screenshots && step.screenshots.length) || step.preHookFailure || step.postHookFailure);
    };
    const stepOutputs = (row) => {
      const step = row && (row.step || (row.concept && row.concept.step));
      if (!step) return [];
      const parts = [];
      const take = (list) => {
        (list || []).forEach((text) => {
          const t = String(text == null ? '' : text);
          if (t !== '') parts.push(t);
        });
      };
      take(step.preHookMessages);
      take(step.messages);
      take(step.postHookMessages);
      if (!parts.length) return [];
      return [{ label: '输出', text: parts.join('\n') }];
    };
    const worse = (a, b) => {
      const rank = { fail: 3, skip: 2, pass: 1, none: 0 };
      return (rank[a] || 0) >= (rank[b] || 0) ? (a || 'none') : (b || 'none');
    };
    const foldVerdict = (scns) => (scns || []).reduce((v, s) => worse(v, s.verdict), 'none');
    const foldDuration = (scns) => formatDuration((scns || []).reduce((n, s) => n + (s.executionTime || 0), 0));
    const rowCells = (dt, index) => {
      if (!dt || !dt.rows || !dt.rows.length) return [];
      if (index >= 0 && index < dt.rows.length) return dt.rows[index];
      return dt.rows[0];
    };
    const dataRowHeading = (headers, cells, i) => {
      const pairs = (headers || []).map((h, idx) => h + '=' + ((cells && cells[idx]) || '')).filter((p) => p !== '=');
      const preview = pairs.length ? pairs.join(', ') : (cells || []).join(', ');
      return preview ? ('第 ' + (i + 1) + ' 行 · ' + preview) : ('第 ' + (i + 1) + ' 行');
    };
    const scenarioRowData = (scn) => {
      if (!scn) return null;
      if (scn.isScenarioTableDriven && scn.scenarioDataTable) {
        return { headers: scn.scenarioDataTable.headers || [], cells: rowCells(scn.scenarioDataTable, scn.scenarioTableRowIndex || 0) };
      }
      return null;
    };
    const groupSheet = (body) => {
      const scns = (body && body.scenarios) || [];
      const first = scns.find((s) => s.scenarioDataTable);
      if (!first || !first.scenarioDataTable) return null;
      const dt = first.scenarioDataTable;
      if (dt.rows && dt.rows.length > 1) return { headers: dt.headers || [], rows: dt.rows };
      return {
        headers: dt.headers || [],
        rows: scns.map((s) => rowCells(s.scenarioDataTable, s.scenarioTableRowIndex || 0))
      };
    };
    const groupScenarioTableDriven = (scns) => {
      const out = [];
      const groups = {};
      (scns || []).forEach((s) => {
        if (s.isScenarioTableDriven) {
          const key = s.heading;
          if (!groups[key]) {
            const g = { kind: 'datadriven', id: s.id + '-dd', heading: s.heading, scenarios: [] };
            groups[key] = g;
            out.push(g);
          }
          groups[key].scenarios.push(s);
        } else {
          out.push(Object.assign({ kind: 'scenario' }, s));
        }
      });
      out.forEach((row) => {
        if (row.kind === 'datadriven') {
          row.verdict = foldVerdict(row.scenarios);
          row.duration = foldDuration(row.scenarios);
          row.executionTime = (row.scenarios || []).reduce((n, s) => n + (s.executionTime || 0), 0);
        }
      });
      return out;
    };
    const specBodyRows = (spec) => {
      const scns = (spec && spec.scenarios) || [];
      const dt = spec && spec.datatable;
      const rows = (dt && dt.rows) || [];
      if (rows.length) {
        const used = {};
        const out = [];
        rows.forEach((cells, i) => {
          const scenarios = scns.filter((s) => s.tableRowIndex === i);
          scenarios.forEach((s) => { used[s.id] = true; });
          out.push({
            kind: 'datarow',
            id: spec.id + '-row-' + i,
            heading: dataRowHeading(dt.headers || [], cells, i),
            headers: dt.headers || [],
            cells: cells || [],
            rowIndex: i,
            scenarios: scenarios,
            verdict: foldVerdict(scenarios),
            duration: foldDuration(scenarios),
            executionTime: scenarios.reduce((n, s) => n + (s.executionTime || 0), 0)
          });
        });
        scns.filter((s) => !used[s.id]).forEach((s) => out.push(Object.assign({ kind: 'scenario' }, s)));
        return out;
      }
      return groupScenarioTableDriven(scns);
    };
    const bodyTypeLabel = (row) => {
      if (row.kind === 'datarow') return '数据行';
      if (row.kind === 'datadriven') return '数据驱动';
      return '场景';
    };
    const bodyName = (row) => {
      if (row.kind === 'datadriven') return row.heading + ' · ' + ((row.scenarios || []).length) + ' 行';
      return row.heading;
    };
    const scenarioRowsFor = (store, scn) => {
      const rows = [];
      (scn.contexts || []).forEach((it) => rows.push(Object.assign({}, it, { phase: 'Context' })));
      (scn.items || []).forEach((it) => rows.push(Object.assign({}, it, { phase: it.kind === 'concept' ? 'Concept' : 'Step' })));
      (scn.teardowns || []).forEach((it) => rows.push(Object.assign({}, it, { phase: 'Teardown' })));
      return rows;
    };
    function clickIsExpandControl(column, event) {
      if (column && column.type === 'expand') return true;
      const el = event && event.target;
      return !!(el && el.closest && el.closest('.el-table__expand-icon'));
    }
    function indexHierarchy(report) {
      const parentOf = {};
      const childrenOf = {};
      const addItems = (pid, items) => {
        const list = items || [];
        childrenOf[pid] = list.map((it) => it.id);
        list.forEach((item) => {
          parentOf[item.id] = pid;
          if (item.kind === 'concept' && item.concept) addItems(item.id, item.concept.items || []);
        });
      };
      const specs = (report && report.specs) || [];
      childrenOf.__specs__ = specs.map((s) => s.id);
      specs.forEach((spec) => {
        parentOf[spec.id] = '__specs__';
        const body = specBodyRows(spec);
        childrenOf[spec.id] = body.map((row) => row.id);
        body.forEach((row) => {
          parentOf[row.id] = spec.id;
          if (row.kind === 'datarow' || row.kind === 'datadriven') {
            const scns = row.scenarios || [];
            childrenOf[row.id] = scns.map((s) => s.id);
            scns.forEach((scn) => {
              parentOf[scn.id] = row.id;
              addItems(scn.id, scenarioAllItems(scn));
            });
          } else {
            addItems(row.id, scenarioAllItems(row));
          }
        });
      });
      return { parentOf, childrenOf };
    }
    function siblingIds(index, id) {
      const parent = index.parentOf[id];
      if (!parent) return [];
      return index.childrenOf[parent] || [];
    }
    function descendantIds(index, id) {
      const out = [];
      const walk = (pid) => {
        (index.childrenOf[pid] || []).forEach((cid) => {
          out.push(cid);
          walk(cid);
        });
      };
      walk(id);
      return out;
    }
    function openAccordionIds(report, expanded, id) {
      if (!id) return expanded || [];
      const index = indexHierarchy(report);
      const drop = new Set();
      siblingIds(index, id).forEach((sid) => {
        if (sid === id) return;
        drop.add(sid);
        descendantIds(index, sid).forEach((d) => drop.add(d));
      });
      const next = (expanded || []).filter((x) => !drop.has(x));
      if (next.indexOf(id) < 0) next.push(id);
      return next;
    }
    function closeAccordionIds(report, expanded, id) {
      if (!id) return expanded || [];
      const index = indexHierarchy(report);
      const drop = new Set([id].concat(descendantIds(index, id)));
      return (expanded || []).filter((x) => !drop.has(x));
    }
    function accordionNormalize(report, ids) {
      let next = [];
      (ids || []).forEach((id) => { next = openAccordionIds(report, next, id); });
      return next;
    }
    function accordionPath(report) {
      const ids = [];
      const specs = (report && report.specs) || [];
      const spec = specs.find((s) => s.verdict === 'fail') || specs[0];
      if (!spec) return ids;
      ids.push(spec.id);
      const body = specBodyRows(spec);
      const bodyRow = body.find((r) => r.verdict === 'fail') || body[0];
      if (!bodyRow) return ids;
      ids.push(bodyRow.id);
      let scn = bodyRow;
      if (bodyRow.kind === 'datarow' || bodyRow.kind === 'datadriven') {
        const scns = bodyRow.scenarios || [];
        scn = scns.find((s) => s.verdict === 'fail') || scns[0];
        if (!scn) return ids;
        ids.push(scn.id);
      }
      const pickFail = (items, trail) => {
        for (const item of items || []) {
          if (itemVerdict(item) === 'fail') return trail.concat([item.id]);
          if (item.kind === 'concept' && item.concept) {
            const nested = pickFail(item.concept.items, trail.concat([item.id]));
            if (nested) return nested;
          }
        }
        return null;
      };
      const failPath = pickFail(scenarioAllItems(scn), []);
      if (failPath) ids.push.apply(ids, failPath);
      return accordionNormalize(report, ids);
    }
    function defaultExpanded(report) {
      return accordionPath(report);
    }

    const VIEW_KEY = 'studio-report-view' + (runDir ? ':' + runDir : '');
    const { createPinia, defineStore } = Pinia;
    const useReportStore = defineStore('report', {
      state: () => ({
        report: ensureReport(runDir ? {} : seeded),
        running: runDir ? false : !!seededEnvelope.running,
        rev: runDir ? 0 : (Number(seededEnvelope.rev) || 0),
        filter: 'all',
        query: '',
        selected: '',
        expanded: runDir ? [] : defaultExpanded(ensureReport(seeded)),
        followLive: true,
        archiveDir: runDir,
        currentSpecId: runDir ? '' : (seededEnvelope.currentSpecId || ''),
        currentScenarioId: runDir ? '' : (seededEnvelope.currentScenarioId || ''),
        startedAt: runDir ? 0 : (Number(seededEnvelope.startedAt) || 0),
        clock: Date.now()
      }),
      actions: {
        restoreView() {
          try {
            const saved = JSON.parse(sessionStorage.getItem(VIEW_KEY) || 'null');
            if (!saved) return;
            if (saved.filter) this.filter = saved.filter;
            if (typeof saved.query === 'string') this.query = saved.query;
            if (saved.selected) this.selected = saved.selected;
            if (typeof saved.followLive === 'boolean') this.followLive = saved.followLive;
            if (Array.isArray(saved.expanded) && saved.expanded.length) this.expanded = accordionNormalize(this.report, saved.expanded);
          } catch (e) {}
        },
        persistView() {
          try {
            sessionStorage.setItem(VIEW_KEY, JSON.stringify({
              filter: this.filter, query: this.query, selected: this.selected,
              expanded: this.expanded, followLive: this.followLive
            }));
          } catch (e) {}
        },
        applyLive(payload, scroll) {
          if (!payload || !payload.report) return;
          const rev = Number(payload.rev) || 0;
          if (rev && this.rev && rev <= this.rev) {
            this.running = !!payload.running;
            return;
          }
          const firstLoad = !this.rev && this.archiveDir;
          this.report = ensureReport(JSON.parse(JSON.stringify(payload.report)));
          this.running = this.archiveDir ? false : !!payload.running;
          this.rev = rev || this.rev;
          if (firstLoad && !this.expanded.length) this.expanded = defaultExpanded(this.report);
          this.currentSpecId = payload.currentSpecId || '';
          this.currentScenarioId = payload.currentScenarioId || '';
          this.startedAt = Number(payload.startedAt) || this.startedAt;
          if (this.running && this.followLive) {
            let exp = this.expanded.slice();
            if (this.currentSpecId) exp = openAccordionIds(this.report, exp, this.currentSpecId);
            if (this.currentScenarioId) exp = openAccordionIds(this.report, exp, this.currentScenarioId);
            this.expanded = exp;
          }
          Vue.nextTick(() => {
            if (scroll && scroll.result) scroll.result.el.scrollTop = scroll.result.top;
          });
        },
        toggleExpand(id) {
          if (!id) return;
          const wasOpen = this.expanded.indexOf(id) >= 0;
          if (wasOpen) {
            this.expanded = closeAccordionIds(this.report, this.expanded, id);
            if (id === this.currentSpecId || id === this.currentScenarioId) this.followLive = false;
          } else {
            this.expanded = openAccordionIds(this.report, this.expanded, id);
          }
          this.persistView();
        },
        expandAll() {
          this.expanded = accordionPath(this.report);
          this.persistView();
        },
        collapseAll() { this.expanded = []; this.persistView(); }
      }
    });

    const HookBlock = {
      name: 'HookBlock',
      props: ['hook'],
      template: `
        <el-alert v-if="hook" type="error" :title="(hook.hookName || 'Hook') + ' 失败'" show-icon style="margin-bottom: 6px">
          <pre class="err">{{ hook.errorMessage }}</pre>
          <pre v-if="hook.stackTrace" class="stack">{{ hook.stackTrace }}</pre>
        </el-alert>`
    };
    const OutputCards = {
      name: 'OutputCards',
      props: { items: { type: Array, default: () => [] } },
      template: `
        <div v-if="items && items.length" class="out-stack">
          <div v-for="(m, i) in items" :key="i" class="out-card">
            <div class="out-card-label">{{ m.label }}</div>
            <pre class="out-card-body">{{ m.text }}</pre>
          </div>
        </div>`
    };
    const DataSheet = {
      name: 'DataSheet',
      props: ['headers', 'cells', 'table', 'caption'],
      computed: {
        cols() { return (this.table && this.table.headers) || this.headers || []; },
        body() {
          if (this.table && this.table.rows) return this.table.rows;
          return [this.cells || []];
        }
      },
      template: `
        <div v-if="cols.length" class="data-sheet">
          <div v-if="caption" class="nested-title">{{ caption }}</div>
          <table class="data-kv">
            <thead><tr><th v-for="(h, i) in cols" :key="i">{{ h }}</th></tr></thead>
            <tbody>
              <tr v-for="(r, ri) in body" :key="ri"><td v-for="(c, ci) in r" :key="ci">{{ c }}</td></tr>
            </tbody>
          </table>
        </div>`
    };
    const ScenarioDetail = {
      name: 'ScenarioDetail',
      props: { scn: { type: Object, required: true }, expanded: { type: Array, default: () => [] } },
      emits: ['expand-change'],
      setup() { return { store: useReportStore() }; },
      methods: {
        sheet() { return scenarioRowData(this.scn); },
        rows() { return scenarioRowsFor(this.store, this.scn); }
      },
      template: `
        <div class="nested-block" :class="'tone-' + (scn.verdict || 'none')">
          <data-sheet v-if="sheet()" :headers="sheet().headers" :cells="sheet().cells" caption="数据行"></data-sheet>
          <div class="expand-meta">
            <el-tag v-for="tag in (scn.tags || [])" :key="tag" size="small">{{ tag }}</el-tag>
            <span v-if="scn.skipErrors && scn.skipErrors.length" class="msg">{{ scn.skipErrors.join('; ') }}</span>
          </div>
          <hook-block :hook="scn.preHookFailure"></hook-block>
          <hook-block :hook="scn.postHookFailure"></hook-block>
          <item-table :items="rows()" :expanded="expanded" @expand-change="$emit('expand-change', $event)"></item-table>
        </div>`
    };
    const ScenarioTable = {
      name: 'ScenarioTable',
      props: { scenarios: { type: Array, default: () => [] }, expanded: { type: Array, default: () => [] } },
      emits: ['expand-change', 'select'],
      methods: {
        tagType, verdictLabel,
        rowClass({ row }) {
          const v = row.verdict;
          return v === 'fail' ? 'row-fail' : (v === 'pass' ? 'row-pass' : (v === 'skip' ? 'row-skip' : ''));
        },
        onRowClick(row, column, event) {
          if (event && event.stopPropagation) event.stopPropagation();
          this.$emit('select', row);
          if (!clickIsExpandControl(column, event)) this.$emit('expand-change', row);
        }
      },
      template: `
        <el-table class="dense-table" :data="scenarios" row-key="id" border size="small" :expand-row-keys="expanded" :row-class-name="rowClass" @expand-change="$emit('expand-change', $event)" @row-click="onRowClick">
          <el-table-column type="expand" width="28">
            <template #default="{ row: scn }">
              <scenario-detail :scn="scn" :expanded="expanded" @expand-change="$emit('expand-change', $event)"></scenario-detail>
            </template>
          </el-table-column>
          <el-table-column label="名称" min-width="180">
            <template #default="{ row: scn }"><div class="name-cell">{{ scn.heading }}</div></template>
          </el-table-column>
          <el-table-column label="类型" width="120" min-width="120" class-name="col-type" label-class-name="col-type"><span class="type-label">场景</span></el-table-column>
          <el-table-column label="结果" width="70">
            <template #default="{ row: scn }"><el-tag :type="tagType(scn.verdict)" size="small">{{ verdictLabel(scn.verdict) }}</el-tag></template>
          </el-table-column>
          <el-table-column label="运行时间" width="96" prop="duration"></el-table-column>
        </el-table>`
    };
    const ItemTable = {
      name: 'ItemTable',
      props: { items: { type: Array, default: () => [] }, expanded: { type: Array, default: () => [] } },
      emits: ['expand-change'],
      methods: {
        tagType, verdictLabel, itemVerdict, itemDuration, itemHasDetail, stepHTML, stepOutputs, assetHref,
        typeLabel(row) {
          if (row.phase === 'Context') return 'Context';
          if (row.phase === 'Teardown') return 'Teardown';
          if (row.kind === 'concept') return '概念';
          if (row.kind === 'comment') return '注释';
          return '步骤';
        },
        nameHTML(row) {
          if (row.kind === 'comment') return this.esc(row.comment || '');
          const step = row.step || (row.concept && row.concept.step);
          return this.stepHTML(step) || this.esc(row.comment || '');
        },
        esc,
        rowClass({ row }) {
          const v = this.itemVerdict(row);
          const tone = v === 'fail' ? 'row-fail' : (v === 'pass' ? 'row-pass' : (v === 'skip' ? 'row-skip' : ''));
          const no = this.itemHasDetail(row) ? '' : 'no-expand';
          return [tone, no].filter(Boolean).join(' ');
        },
        onRowClick(row, column, event) {
          if (event && event.stopPropagation) event.stopPropagation();
          if (clickIsExpandControl(column, event)) return;
          if (!this.itemHasDetail(row)) return;
          this.$emit('expand-change', row);
        },
        shots(row) {
          const step = row.step || (row.concept && row.concept.step);
          if (!step) return [];
          return [step.failureScreenshot].concat(step.screenshots || []).concat(step.preHookScreenshots || []).concat(step.postHookScreenshots || []).filter(Boolean);
        }
      },
      template: `
        <el-table class="dense-table" :data="items" row-key="id" border size="small" :expand-row-keys="expanded" :row-class-name="rowClass" @expand-change="$emit('expand-change', $event)" @row-click="onRowClick">
          <el-table-column type="expand" width="28">
            <template #default="{ row }">
              <div class="nested-block" :class="'tone-' + itemVerdict(row)">
                <div v-if="row.kind === 'concept' && row.concept && row.concept.items && row.concept.items.length">
                  <item-table :items="(row.concept.items || []).map(it => Object.assign({}, it, { phase: 'Step' }))" :expanded="expanded" @expand-change="$emit('expand-change', $event)"></item-table>
                </div>
                <template v-if="row.step || (row.concept && row.concept.step)">
                  <div v-if="(row.step || row.concept.step).errorMessage" class="err">{{ (row.step || row.concept.step).errorMessage }}</div>
                  <div v-if="(row.step || row.concept.step).skippedReason" class="msg">跳过：{{ (row.step || row.concept.step).skippedReason }}</div>
                  <pre v-if="(row.step || row.concept.step).stackTrace" class="stack">{{ (row.step || row.concept.step).stackTrace }}</pre>
                  <div v-if="shots(row).length" class="shots">
                    <a v-for="p in shots(row)" :key="p" :href="assetHref(p)" target="_blank"><img :src="assetHref(p)" alt="screenshot"></a>
                  </div>
                </template>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="名称" min-width="200">
            <template #default="{ row }">
              <div class="name-cell" v-html="nameHTML(row)"></div>
              <output-cards :items="stepOutputs(row)"></output-cards>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="120" min-width="120" class-name="col-type" label-class-name="col-type">
            <template #default="{ row }"><span class="type-label">{{ typeLabel(row) }}</span></template>
          </el-table-column>
          <el-table-column label="结果" width="70">
            <template #default="{ row }"><el-tag :type="tagType(itemVerdict(row))" size="small">{{ verdictLabel(itemVerdict(row)) }}</el-tag></template>
          </el-table-column>
          <el-table-column label="运行时间" width="96">
            <template #default="{ row }">{{ itemDuration(row) }}</template>
          </el-table-column>
        </el-table>`
    };
    ScenarioDetail.components = { DataSheet, HookBlock, ItemTable };
    ScenarioTable.components = { ScenarioDetail };
    ItemTable.components = { OutputCards };

    function captureScroll() {
      const result = document.querySelector('main.result-pane');
      return { result: result ? { el: result, top: result.scrollTop } : null };
    }

    async function fetchJSON(urls) {
      for (const url of urls) {
        try {
          const res = await fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 'ts=' + Date.now(), { cache: 'no-store' });
          if (res.ok) return await res.json();
        } catch (e) {}
      }
      return null;
    }
    function loadScriptData(src, key) {
      return new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + 'ts=' + Date.now();
        s.onload = () => {
          const v = window[key];
          try { delete window[key]; } catch (e) { window[key] = null; }
          resolve(v || null);
          s.remove();
        };
        s.onerror = () => { resolve(null); s.remove(); };
        document.head.appendChild(s);
      });
    }
    function safeRelDir(rel) {
      rel = String(rel || '').replace(/\\/g, '/').replace(/\/+$/, '');
      if (!rel || rel.charAt(0) === '/' || rel.indexOf('..') >= 0 || /^[a-zA-Z]:/.test(rel)) return '';
      return rel;
    }
    function liveWebSocketURL() {
      try {
        const q = new URLSearchParams(window.location.search).get('ws');
        if (q) return q;
      } catch (e) {}
      return window.__GAUGE_WS__ || '';
    }
    function applyLivePayload(store, payload, scroll) {
      if (!payload || !payload.report) return;
      if (payload.rev && store.rev && Number(payload.rev) <= store.rev) {
        store.running = !!payload.running;
        if (payload.currentSpecId) store.currentSpecId = payload.currentSpecId;
        if (payload.currentScenarioId) store.currentScenarioId = payload.currentScenarioId;
        return;
      }
      store.applyLive(payload, scroll);
    }
    function connectReportWebSocket(store) {
      const url = liveWebSocketURL();
      if (!url) return null;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return null; }
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.type !== 'ReportSnapshot' || !msg.payload) return;
        const payload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
        applyLivePayload(store, payload, captureScroll());
      };
      ws.onclose = () => {
        if (!store.archiveDir && store.running) {
          window.setTimeout(() => connectReportWebSocket(store), 1000);
        }
      };
      return ws;
    }
    async function fetchLive() {
      const base = runDir ? runDir + '/' : '';
      const json = await fetchJSON([base + 'report.json']);
      if (json) return json;
      return loadScriptData(base + 'report-live.js', '__GAUGE_LIVE__');
    }
    const reportViewMixin = {
      computed: {
        successRate() {
          const n = this.store.report.successRate;
          return n == null ? 0 : Math.round(n);
        },
        displayDuration() {
          if (this.store.running && this.store.startedAt) {
            return formatDuration(Math.max(0, this.store.clock - this.store.startedAt));
          }
          return this.store.report.duration;
        },
        q() { return this.store.query.trim().toLowerCase(); },
        visibleSpecs() {
          return (this.store.report.specs || []).filter((spec) => this.specVisible(spec));
        },
        liveNowLabel() {
          const spec = (this.store.report.specs || []).find((s) => s.id === this.store.currentSpecId);
          if (!spec) return '';
          const scn = (spec.scenarios || []).find((x) => x.id === this.store.currentScenarioId);
          return scn ? (spec.heading + ' / ' + scn.heading) : spec.heading;
        },
        selectedLabel() {
          if (!this.store.selected || this.store.selected === 'folder:specs' || this.store.selected === 'suite') return this.store.report.projectName;
          const spec = (this.store.report.specs || []).find((s) => s.id === this.store.selected);
          if (spec) return spec.heading;
          for (const s of this.store.report.specs || []) {
            const scn = (s.scenarios || []).find((x) => x.id === this.store.selected);
            if (scn) return s.heading + ' / ' + scn.heading;
          }
          return this.store.report.projectName;
        }
      },
      methods: {
        verdictLabel, tagType,
        specVisible(spec) {
          if (this.store.filter === 'all' && !this.q) return true;
          if (!matchQuery(this.q, specTexts(spec))) return false;
          if (this.store.filter === 'all') return true;
          if (spec.verdict === this.store.filter) return true;
          return (spec.scenarios || []).some((scn) => this.scenarioVisible(scn));
        },
        scenarioVisible(scn) {
          if (this.store.filter === 'all' && !this.q) return true;
          if (!matchQuery(this.q, scenarioTexts(scn))) return false;
          if (this.store.filter === 'all') return true;
          if (scn.verdict === this.store.filter) return true;
          let hit = false;
          walkItems(scenarioAllItems(scn), (item) => {
            if (itemVerdict(item) === this.store.filter) hit = true;
          });
          return hit;
        },
        bodyTypeLabel, bodyName, groupSheet,
        visibleSpecBodyRows(spec) {
          return specBodyRows(spec).map((row) => {
            if (row.kind === 'datarow' || row.kind === 'datadriven') {
              const scenarios = (row.scenarios || []).filter((scn) => this.scenarioVisible(scn));
              if (!scenarios.length && (this.store.filter !== 'all' || this.q)) return null;
              return Object.assign({}, row, { scenarios });
            }
            return this.scenarioVisible(row) ? row : null;
          }).filter(Boolean);
        },
        rowClass({ row }) {
          const v = row.verdict;
          const live = this.store.running && row.id && (row.id === this.store.currentSpecId || row.id === this.store.currentScenarioId) ? ' row-live' : '';
          return (v === 'fail' ? 'row-fail' : (v === 'pass' ? 'row-pass' : (v === 'skip' ? 'row-skip' : ''))) + live;
        },
        onExpandChange(row) { this.store.toggleExpand(row && row.id); },
        onSpecClick(row, column, event) {
          if (event && event.stopPropagation) event.stopPropagation();
          this.store.selected = row.id;
          if (!clickIsExpandControl(column, event)) this.store.toggleExpand(row.id);
          this.store.persistView();
        },
        onBodyClick(row, column, event) {
          if (event && event.stopPropagation) event.stopPropagation();
          this.store.selected = row.id;
          if (!clickIsExpandControl(column, event)) this.store.toggleExpand(row.id);
          this.store.persistView();
        },
        onSelectRow(row) {
          if (row && row.id) this.store.selected = row.id;
          this.store.persistView();
        },
        expandAll() { this.store.expandAll(); },
        collapseAll() { this.store.collapseAll(); },
        printReport() { window.print(); },
        async pollLive() {
          if (this._liveBusy) return;
          this._liveBusy = true;
          try {
            const payload = await fetchLive();
            if (!payload || !payload.report) return;
            if (payload.rev && this.store.rev && Number(payload.rev) <= this.store.rev) {
              this.store.running = !!payload.running;
              if (payload.currentSpecId) this.store.currentSpecId = payload.currentSpecId;
              if (payload.currentScenarioId) this.store.currentScenarioId = payload.currentScenarioId;
              return;
            }
            const scroll = captureScroll();
            this.store.applyLive(payload, scroll);
          } finally {
            this._liveBusy = false;
          }
        }
      }
    };

    const app = Vue.createApp({
      mixins: [reportViewMixin],
      components: { ItemTable, HookBlock, DataSheet, ScenarioDetail, ScenarioTable, OutputCards },
      setup() {
        const store = useReportStore();
        store.restoreView();
        return { store };
      },
      watch: {
        'store.query'() { this.store.persistView(); },
        'store.filter'() { this.store.persistView(); }
      },
      mounted() {
        this.pollLive();
        if (!this.store.archiveDir) {
          this._liveTimer = setInterval(() => this.pollLive(), 700);
          this._tickTimer = setInterval(() => { this.store.clock = Date.now(); }, 250);
        }
      },
      beforeUnmount() {
        if (this._liveTimer) clearInterval(this._liveTimer);
        if (this._tickTimer) clearInterval(this._tickTimer);
      }
    });
    const pinia = createPinia();
    app.use(pinia);
    app.use(ElementPlus);
    app.mount('#app');
    document.title = 'Test Report Viewer - ' + (seeded.projectName || 'report');

