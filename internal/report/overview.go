package report

import (
	"bytes"
	"fmt"
	"html"
	"sort"
	"strconv"
	"strings"
)

func writeOverviewPanel(b *bytes.Buffer, r *Report) {
	b.WriteString("<section id=\"overview\" class=\"overview-panel\" data-pane=\"overview\">\n")
	b.WriteString("<h2 class=\"overview-title\">Overview</h2>\n")
	b.WriteString("<p class=\"overview-lead\">测试执行摘要与环境配置（类似 CANoe Test Report 首页）。左侧导航可跳转到规格书 / 场景。</p>\n")

	b.WriteString("<div class=\"overview-grid\">\n")
	writeOverviewKV(b, "项目", r.ProjectName)
	writeOverviewKV(b, "结果", verdictLabel(r.Verdict))
	writeOverviewKV(b, "环境", fallback(r.Environment, "—"))
	writeOverviewKV(b, "标签", fallback(r.Tags, "—"))
	writeOverviewKV(b, "开始时间", fallback(r.Timestamp, "—"))
	writeOverviewKV(b, "耗时", fallback(r.Duration, "—"))
	writeOverviewKV(b, "成功率", fmt.Sprintf("%.1f%%", r.SuccessRate))
	writeOverviewKV(b, "格式版本", strconv.Itoa(r.Meta.FormatVersion))
	writeOverviewKV(b, "插件版本", fallback(r.Meta.PluginVersion, "—"))
	writeOverviewKV(b, "主机", fallback(r.Meta.HostName, "—"))
	writeOverviewKV(b, "操作系统", fmt.Sprintf("%s/%s", fallback(r.Meta.GOOS, "?"), fallback(r.Meta.GOARCH, "?")))
	writeOverviewKV(b, "CPU", strconv.Itoa(r.Meta.NumCPU))
	writeOverviewKV(b, "项目根目录", fallback(r.Meta.ProjectRoot, "—"))
	writeOverviewKV(b, "报告生成时间", fallback(r.Meta.GeneratedAt, "—"))
	if len(r.Meta.Extra) > 0 {
		keys := make([]string, 0, len(r.Meta.Extra))
		for k := range r.Meta.Extra {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			writeOverviewKV(b, k, r.Meta.Extra[k])
		}
	}
	b.WriteString("</div>\n")

	b.WriteString("<h3 class=\"overview-subtitle\">统计</h3>\n")
	b.WriteString("<table class=\"overview-table\"><thead><tr><th>层级</th><th>总计</th><th>通过</th><th>失败</th><th>跳过</th></tr></thead><tbody>\n")
	writeOverviewCountRow(b, "规格书", "specs", r.Summary.Specs)
	writeOverviewCountRow(b, "场景", "scenarios", r.Summary.Scenarios)
	writeOverviewCountRow(b, "步骤", "steps", r.Summary.Steps)
	b.WriteString("</tbody></table>\n")

	writeFailReasonSection(b, AggregateFailReasons(r))

	if len(r.Specs) > 0 {
		b.WriteString("<h3 class=\"overview-subtitle\">规格书清单</h3>\n")
		b.WriteString("<p class=\"overview-lead\">过滤或「仅失败步骤」开启时，列表与场景计数同步为结果树当前可见项。</p>\n")
		b.WriteString("<table class=\"overview-table overview-spec-table\" id=\"overview-spec-table\"><thead><tr><th>规格书</th><th>结果</th><th>场景</th><th>耗时</th></tr></thead><tbody>\n")
		for i := range r.Specs {
			sp := &r.Specs[i]
			b.WriteString("<tr class=\"overview-spec-row\" data-spec-id=\"")
			b.WriteString(html.EscapeString(sp.ID))
			b.WriteString("\" data-verdict=\"")
			b.WriteString(html.EscapeString(sp.Verdict))
			b.WriteString("\"><td><a href=\"#")
			b.WriteString(html.EscapeString(sp.ID))
			b.WriteString("\" data-nav-target=\"")
			b.WriteString(html.EscapeString(sp.ID))
			b.WriteString("\">")
			b.WriteString(html.EscapeString(sp.Heading))
			b.WriteString("</a></td><td><span class=\"badge ")
			b.WriteString(html.EscapeString(sp.Verdict))
			b.WriteString("\">")
			b.WriteString(html.EscapeString(verdictLabel(sp.Verdict)))
			b.WriteString("</span></td><td class=\"overview-spec-scn-count\" data-spec-scn-count>")
			b.WriteString(html.EscapeString(fmt.Sprintf("%d/%d", sp.Summary.Passed, sp.Summary.Total)))
			b.WriteString("</td><td>")
			b.WriteString(html.EscapeString(sp.Duration))
			b.WriteString("</td></tr>\n")
		}
		b.WriteString("</tbody></table>\n")
	}

	b.WriteString("<h3 class=\"overview-subtitle\">截图显示策略</h3>\n")
	b.WriteString("<ul class=\"overview-notes\">\n")
	b.WriteString("<li><strong>步骤截图</strong>：展示步骤内全部 <code>screenshots</code>，失败截图单独标注。</li>\n")
	b.WriteString("<li><strong>Hook 截图</strong>：Suite / Spec / Scenario / Step 的 before/after 与 hook 失败截图一并展示。</li>\n")
	b.WriteString("<li><strong>交互</strong>：缩略图点击后在对话框中放大（非跳转新页）。</li>\n")
	b.WriteString("<li><strong>便携性</strong>：落盘为相对路径 <code>images/…</code>，随 <code>.uhilreport</code> 再生。</li>\n")
	b.WriteString("</ul>\n")
	b.WriteString("</section>\n")
}

func writeOverviewKV(b *bytes.Buffer, k, v string) {
	b.WriteString("<div class=\"overview-kv\"><div class=\"overview-k\">")
	b.WriteString(html.EscapeString(k))
	b.WriteString("</div><div class=\"overview-v\">")
	b.WriteString(html.EscapeString(v))
	b.WriteString("</div></div>\n")
}

func writeOverviewCountRow(b *bytes.Buffer, label, kind string, c Counts) {
	b.WriteString("<tr class=\"overview-count-row\" data-count-kind=\"")
	b.WriteString(html.EscapeString(kind))
	b.WriteString("\"><td>")
	b.WriteString(html.EscapeString(label))
	b.WriteString("</td><td data-count=\"total\">")
	b.WriteString(strconv.Itoa(c.Total))
	b.WriteString("</td><td data-count=\"passed\">")
	b.WriteString(strconv.Itoa(c.Passed))
	b.WriteString("</td><td data-count=\"failed\">")
	b.WriteString(strconv.Itoa(c.Failed))
	b.WriteString("</td><td data-count=\"skipped\">")
	b.WriteString(strconv.Itoa(c.Skipped))
	b.WriteString("</td></tr>\n")
}

func writeNavPane(b *bytes.Buffer, r *Report) {
	b.WriteString("<aside class=\"nav-pane\" aria-label=\"报告导航\">\n")
	b.WriteString("<div class=\"nav-head\">导航</div>\n")
	b.WriteString("<nav class=\"nav-tree\">\n")
	b.WriteString("<a class=\"nav-item nav-overview is-active\" href=\"#overview\" data-nav-target=\"overview\">Overview</a>\n")
	for i := range r.Specs {
		sp := &r.Specs[i]
		b.WriteString("<details class=\"nav-spec\" data-spec-id=\"")
		b.WriteString(html.EscapeString(sp.ID))
		b.WriteString("\" open>\n<summary class=\"nav-item nav-spec-sum tone-")
		b.WriteString(html.EscapeString(sp.Verdict))
		b.WriteString("\"><a href=\"#")
		b.WriteString(html.EscapeString(sp.ID))
		b.WriteString("\" data-nav-target=\"")
		b.WriteString(html.EscapeString(sp.ID))
		b.WriteString("\">")
		b.WriteString(html.EscapeString(sp.Heading))
		b.WriteString("</a><span class=\"nav-count\" data-nav-scn-count>")
		b.WriteString(html.EscapeString(fmt.Sprintf("%d/%d", sp.Summary.Passed, sp.Summary.Total)))
		b.WriteString("</span><span class=\"nav-badge ")
		b.WriteString(html.EscapeString(sp.Verdict))
		b.WriteString("\">")
		b.WriteString(html.EscapeString(verdictLabel(sp.Verdict)))
		b.WriteString("</span></summary>\n")
		for j := range sp.Scenarios {
			scn := &sp.Scenarios[j]
			b.WriteString("<a class=\"nav-item nav-scn tone-")
			b.WriteString(html.EscapeString(scn.Verdict))
			b.WriteString("\" href=\"#")
			b.WriteString(html.EscapeString(scn.ID))
			b.WriteString("\" data-nav-target=\"")
			b.WriteString(html.EscapeString(scn.ID))
			b.WriteString("\" data-scn-id=\"")
			b.WriteString(html.EscapeString(scn.ID))
			b.WriteString("\" data-verdict=\"")
			b.WriteString(html.EscapeString(scn.Verdict))
			b.WriteString("\">")
			b.WriteString(html.EscapeString(scn.Heading))
			b.WriteString("<span class=\"nav-badge ")
			b.WriteString(html.EscapeString(scn.Verdict))
			b.WriteString("\">")
			b.WriteString(html.EscapeString(verdictLabel(scn.Verdict)))
			b.WriteString("</span></a>\n")
		}
		b.WriteString("</details>\n")
	}
	b.WriteString("</nav>\n</aside>\n")
}

func writeShotGallery(b *bytes.Buffer, label string, shots []string, failure string) {
	seen := map[string]struct{}{}
	var items []shotItem
	add := func(path, kind string) {
		path = strings.TrimSpace(path)
		if path == "" {
			return
		}
		if _, ok := seen[path]; ok {
			return
		}
		seen[path] = struct{}{}
		items = append(items, shotItem{path: path, kind: kind})
	}
	for _, p := range shots {
		add(p, "step")
	}
	add(failure, "failure")
	if len(items) == 0 {
		return
	}
	b.WriteString("<div class=\"shots\" data-shot-gallery>")
	if label != "" {
		b.WriteString("<div class=\"shots-label\">")
		b.WriteString(html.EscapeString(label))
		b.WriteString("</div>")
	}
	for _, it := range items {
		cls := "shot"
		cap := "截图"
		if it.kind == "failure" {
			cls = "shot shot-fail"
			cap = "失败截图"
		}
		b.WriteString("<figure class=\"")
		b.WriteString(cls)
		b.WriteString("\"><button type=\"button\" class=\"shot-thumb\" data-shot-src=\"")
		b.WriteString(html.EscapeString(it.path))
		b.WriteString("\" data-shot-caption=\"")
		b.WriteString(html.EscapeString(cap))
		b.WriteString("\" aria-label=\"")
		b.WriteString(html.EscapeString(cap + "：点击放大"))
		b.WriteString("\"><img src=\"")
		b.WriteString(html.EscapeString(it.path))
		b.WriteString("\" alt=\"")
		b.WriteString(html.EscapeString(cap))
		b.WriteString("\" loading=\"lazy\"></button>")
		b.WriteString("<figcaption>")
		b.WriteString(html.EscapeString(cap))
		b.WriteString("</figcaption></figure>")
	}
	b.WriteString("</div>\n")
}

type shotItem struct {
	path string
	kind string
}

func writeShotLightbox(b *bytes.Buffer) {
	b.WriteString(`<dialog id="shot-lightbox" class="shot-lightbox" closedby="any">`)
	b.WriteString(`<form method="dialog" class="shot-lightbox-bar">`)
	b.WriteString(`<div class="shot-lightbox-nav">`)
	b.WriteString(`<button type="button" class="shot-lightbox-prev" data-lightbox-nav="-1" aria-label="上一张截图" title="← 上一张">‹</button>`)
	b.WriteString(`<button type="button" class="shot-lightbox-next" data-lightbox-nav="1" aria-label="下一张截图" title="→ 下一张">›</button>`)
	b.WriteString(`</div>`)
	b.WriteString(`<span id="shot-lightbox-cap"></span>`)
	b.WriteString(`<span id="shot-lightbox-pos" class="shot-lightbox-pos" aria-live="polite"></span>`)
	b.WriteString(`<button value="close" type="submit" class="shot-lightbox-close">关闭</button></form>`)
	b.WriteString(`<img id="shot-lightbox-img" alt="screenshot enlarged">`)
	b.WriteString(`</dialog>`)
	b.WriteByte('\n')
}

func writeFailReasonSection(b *bytes.Buffer, groups []FailReasonGroup) {
	if len(groups) == 0 {
		return
	}
	b.WriteString("<h3 class=\"overview-subtitle\">失败原因聚合</h3>\n")
	b.WriteString("<p class=\"overview-lead\">按首条错误信息归类失败场景，便于识别共因。点击次数或原因跳到该类首个可见失败场景；点击场景名直接定位；「复制深链」复制带 path-style focus 的可分享 URL（保留当前过滤）。过滤或「仅失败步骤」开启时，上方汇总计数、失败原因聚合与复制摘要均仅统计结果树中当前可见的节点。</p>\n")
	b.WriteString("<table class=\"overview-table fail-reason-table\" id=\"fail-reason-table\"><thead><tr><th>次数</th><th>原因</th><th>场景</th><th>深链</th></tr></thead><tbody>\n")
	for _, g := range groups {
		b.WriteString("<tr class=\"fail-reason-row\" data-fail-reason=\"")
		b.WriteString(html.EscapeString(g.Reason))
		b.WriteString("\" data-fail-count-total=\"")
		b.WriteString(strconv.Itoa(g.Count))
		b.WriteString("\"><td><span class=\"fail-reason-count\" title=\"跳到该类首个可见失败场景\">")
		b.WriteString(strconv.Itoa(g.Count))
		b.WriteString("</span></td><td><code class=\"fail-reason-text\" title=\"")
		b.WriteString(html.EscapeString(g.Reason))
		b.WriteString(" — 点击跳到该类首个可见失败场景\">")
		b.WriteString(html.EscapeString(g.Reason))
		b.WriteString("</code></td><td class=\"fail-reason-refs\">")
		for _, ref := range g.Refs {
			label := ref.ScnName
			if label == "" {
				label = ref.SpecName
			}
			if ref.ScnID != "" {
				b.WriteString("<span class=\"fail-reason-ref\" data-fail-ref-kind=\"scenario\" data-scn-id=\"")
				b.WriteString(html.EscapeString(ref.ScnID))
				b.WriteString("\"><a href=\"#")
				b.WriteString(html.EscapeString(ref.ScnID))
				b.WriteString("\" data-nav-target=\"")
				b.WriteString(html.EscapeString(ref.ScnID))
				b.WriteString("\">")
				b.WriteString(html.EscapeString(label))
				b.WriteString("</a></span>")
			} else if ref.SpecID != "" {
				b.WriteString("<span class=\"fail-reason-ref\" data-fail-ref-kind=\"hook\" data-spec-id=\"")
				b.WriteString(html.EscapeString(ref.SpecID))
				b.WriteString("\"><a href=\"#")
				b.WriteString(html.EscapeString(ref.SpecID))
				b.WriteString("\" data-nav-target=\"")
				b.WriteString(html.EscapeString(ref.SpecID))
				b.WriteString("\">")
				b.WriteString(html.EscapeString(label))
				b.WriteString("</a></span>")
			} else {
				b.WriteString("<span class=\"fail-reason-ref\" data-fail-ref-kind=\"hook\">")
				b.WriteString(html.EscapeString(label))
				b.WriteString("</span>")
			}
		}
		b.WriteString("</td><td class=\"fail-reason-actions\"><button type=\"button\" class=\"action-btn action-btn-tiny\" data-action=\"copy-fail-reason-link\" title=\"复制该类首个可见失败场景的可分享定位深链\">复制深链</button></td></tr>\n")
	}
	b.WriteString("</tbody></table>\n")
}
