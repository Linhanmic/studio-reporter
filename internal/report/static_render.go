package report

import (
	"bytes"
	"fmt"
	"html"
	"strings"

	_ "embed"
)

//go:embed static_report.css
var staticReportCSS string

// RenderReportHTML builds a self-contained static HTML report (no embedded JSON / no Vue).
func RenderReportHTML(r *Report) ([]byte, error) {
	if r == nil {
		r = &Report{ProjectName: "Gauge Suite", Duration: formatDuration(0), Verdict: VerdictNone}
	}
	Recount(r)
	var b bytes.Buffer
	b.WriteString("<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n")
	b.WriteString("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n")
	b.WriteString("<title>")
	b.WriteString(html.EscapeString("Test Report Viewer — " + r.ProjectName))
	b.WriteString("</title>\n<style>\n")
	b.WriteString(staticReportCSS)
	b.WriteString("</style>\n</head>\n<body>\n<div class=\"app-shell\">\n")
	writeStaticHeader(&b, r)
	b.WriteString("<main class=\"result-pane\">\n")
	writeHookAlert(&b, r.PreHookFailure, "Before Suite")
	writeHookAlert(&b, r.PostHookFailure, "After Suite")
	for i := range r.Specs {
		writeSpecBlock(&b, &r.Specs[i], i == 0)
	}
	b.WriteString("</main>\n")
	writeStaticFooter(&b, r)
	b.WriteString("</div>\n</body>\n</html>\n")
	return b.Bytes(), nil
}

// RenderSnapshotHTML renders a completed snapshot as static HTML.
func RenderSnapshotHTML(snap *LiveSnapshot) ([]byte, error) {
	if snap == nil || snap.Report == nil {
		return RenderReportHTML(nil)
	}
	return RenderReportHTML(snap.Report)
}

func writeStaticHeader(b *bytes.Buffer, r *Report) {
	b.WriteString("<header class=\"app-header\"><h1>")
	b.WriteString(html.EscapeString("Test Report Viewer — " + r.ProjectName))
	b.WriteString(" <span class=\"badge pass\">已完成</span></h1>\n<div class=\"meta\">")
	b.WriteString(html.EscapeString(fallback(r.Environment, "-")))
	b.WriteString(" · ")
	b.WriteString(html.EscapeString(r.Timestamp))
	b.WriteString(" · 总耗时 ")
	b.WriteString(html.EscapeString(r.Duration))
	b.WriteString("</div>\n<div class=\"stat-row\">\n")
	writeStatCard(b, "规格书", r.Summary.Specs)
	writeStatCard(b, "场景", r.Summary.Scenarios)
	writeStatCard(b, "步骤", r.Summary.Steps)
	b.WriteString("<div class=\"stat-card\"><div class=\"label\">运行时间</div><div class=\"value\">")
	b.WriteString(html.EscapeString(r.Duration))
	b.WriteString("</div><div class=\"sub\">成功率 ")
	b.WriteString(html.EscapeString(fmt.Sprintf("%.0f", r.SuccessRate)))
	b.WriteString("%</div></div>\n</div></header>\n")
}

func writeStatCard(b *bytes.Buffer, label string, c Counts) {
	b.WriteString("<div class=\"stat-card\"><div class=\"label\">")
	b.WriteString(html.EscapeString(label))
	b.WriteString("</div><div class=\"value\">")
	b.WriteString(html.EscapeString(fmt.Sprintf("%d/%d", c.Passed, c.Total)))
	b.WriteString("</div><div class=\"sub\">通过 / 共 ")
	b.WriteString(html.EscapeString(fmt.Sprintf("%d", c.Total)))
	b.WriteString(" · 失败 ")
	b.WriteString(html.EscapeString(fmt.Sprintf("%d", c.Failed)))
	b.WriteString("</div></div>\n")
}

func writeStaticFooter(b *bytes.Buffer, r *Report) {
	b.WriteString("<footer class=\"status\"><span>")
	b.WriteString(html.EscapeString(r.ProjectName))
	b.WriteString("</span><span>规格书 ")
	b.WriteString(html.EscapeString(fmt.Sprintf("%d/%d", r.Summary.Specs.Passed, r.Summary.Specs.Total)))
	b.WriteString(" · 场景 ")
	b.WriteString(html.EscapeString(fmt.Sprintf("%d/%d", r.Summary.Scenarios.Passed, r.Summary.Scenarios.Total)))
	b.WriteString(" · 步骤 ")
	b.WriteString(html.EscapeString(fmt.Sprintf("%d/%d", r.Summary.Steps.Passed, r.Summary.Steps.Total)))
	b.WriteString(" · ")
	b.WriteString(html.EscapeString(r.Duration))
	b.WriteString("</span></footer>\n")
}

func writeHookAlert(b *bytes.Buffer, h *HookFailure, name string) {
	if h == nil {
		return
	}
	title := h.HookName
	if title == "" {
		title = name
	}
	b.WriteString("<div class=\"hook-alert\"><strong>")
	b.WriteString(html.EscapeString(title))
	b.WriteString(" 失败</strong><div>")
	b.WriteString(html.EscapeString(h.ErrorMessage))
	b.WriteString("</div></div>\n")
}

func writeSpecBlock(b *bytes.Buffer, spec *SpecReport, open bool) {
	tone := toneClass(spec.Verdict)
	b.WriteString("<details class=\"report-block ")
	b.WriteString(tone)
	if open {
		b.WriteString("\" open>\n")
	} else {
		b.WriteString("\">\n")
	}
	b.WriteString("<summary><span class=\"name-cell\">")
	b.WriteString(html.EscapeString(spec.Heading))
	b.WriteString("</span><span class=\"type-label\">规格书</span><span class=\"badge ")
	b.WriteString(html.EscapeString(spec.Verdict))
	b.WriteString("\">")
	b.WriteString(html.EscapeString(verdictLabel(spec.Verdict)))
	b.WriteString("</span><span class=\"dur\">")
	b.WriteString(html.EscapeString(spec.Duration))
	b.WriteString("</span></summary>\n<div class=\"block-body\">\n")
	if len(spec.Folders) > 0 {
		b.WriteString("<div class=\"msg\">")
		b.WriteString(html.EscapeString(strings.Join(spec.Folders, " / ")))
		b.WriteString("</div>\n")
	}
	for _, row := range specBodyRows(*spec) {
		writeBodyRow(b, row)
	}
	b.WriteString("</div></details>\n")
}

func writeBodyRow(b *bytes.Buffer, row bodyRow) {
	tone := toneClass(row.verdict)
	b.WriteString("<details class=\"report-block ")
	b.WriteString(tone)
	b.WriteString("\"><summary><span class=\"name-cell\">")
	b.WriteString(html.EscapeString(bodyName(row)))
	b.WriteString("</span><span class=\"type-label\">")
	b.WriteString(html.EscapeString(bodyTypeLabel(row)))
	b.WriteString("</span><span class=\"badge ")
	b.WriteString(html.EscapeString(row.verdict))
	b.WriteString("\">")
	b.WriteString(html.EscapeString(verdictLabel(row.verdict)))
	b.WriteString("</span><span class=\"dur\">")
	b.WriteString(html.EscapeString(row.duration))
	b.WriteString("</span></summary>\n<div class=\"block-body\">\n")
	if row.kind == "datarow" && len(row.headers) > 0 {
		writeDataKV(b, row.headers, row.cells)
	}
	for _, scn := range row.scenarios {
		writeScenarioBlock(b, scn)
	}
	b.WriteString("</div></details>\n")
}

func writeScenarioBlock(b *bytes.Buffer, scn ScenarioReport) {
	tone := toneClass(scn.Verdict)
	b.WriteString("<details class=\"report-block ")
	b.WriteString(tone)
	b.WriteString("\"><summary><span class=\"name-cell\">")
	b.WriteString(html.EscapeString(scn.Heading))
	b.WriteString("</span><span class=\"type-label\">场景</span><span class=\"badge ")
	b.WriteString(html.EscapeString(scn.Verdict))
	b.WriteString("\">")
	b.WriteString(html.EscapeString(verdictLabel(scn.Verdict)))
	b.WriteString("</span><span class=\"dur\">")
	b.WriteString(html.EscapeString(scn.Duration))
	b.WriteString("</span></summary>\n<div class=\"block-body\">\n")
	writeHookAlert(b, scn.PreHookFailure, "Before Scenario")
	writeHookAlert(b, scn.PostHookFailure, "After Scenario")
	if scn.ScenarioDataTable != nil {
		writeDataTable(b, scn.ScenarioDataTable)
	}
	b.WriteString("<table class=\"step-table\"><thead><tr><th>阶段</th><th>名称</th><th>结果</th><th>运行时间</th></tr></thead><tbody>\n")
	for _, row := range scenarioPhaseItems(scn) {
		writeItemRow(b, row.phase, row.item)
	}
	b.WriteString("</tbody></table>\n")
	for _, row := range scenarioPhaseItems(scn) {
		writeItemDetail(b, row.item)
	}
	b.WriteString("</div></details>\n")
}

func writeItemRow(b *bytes.Buffer, phase string, item ItemReport) {
	verdict := itemVerdict(item)
	b.WriteString("<tr class=\"row-")
	b.WriteString(html.EscapeString(verdict))
	b.WriteString("\"><td>")
	b.WriteString(html.EscapeString(phase))
	b.WriteString("</td><td>")
	b.WriteString(itemTextHTML(item))
	b.WriteString("</td><td>")
	b.WriteString(html.EscapeString(verdictLabel(verdict)))
	b.WriteString("</td><td>")
	b.WriteString(html.EscapeString(item.Duration))
	b.WriteString("</td></tr>\n")
	if item.Kind == "concept" && item.Concept != nil {
		for _, child := range item.Concept.Items {
			writeItemRow(b, "  ↳", child)
		}
	}
}

func writeItemDetail(b *bytes.Buffer, item ItemReport) {
	if item.Kind == "concept" && item.Concept != nil {
		for _, child := range item.Concept.Items {
			writeItemDetail(b, child)
		}
		if item.Concept.Step != nil {
			writeStepDetail(b, item.Concept.Step)
		}
		return
	}
	if item.Step != nil {
		writeStepDetail(b, item.Step)
	}
}

func writeStepDetail(b *bytes.Buffer, step *StepReport) {
	if step == nil {
		return
	}
	var parts []string
	if step.ErrorMessage != "" {
		parts = append(parts, "<div class=\"err\">"+html.EscapeString(step.ErrorMessage)+"</div>")
	}
	if step.StackTrace != "" {
		parts = append(parts, "<pre class=\"stack\">"+html.EscapeString(step.StackTrace)+"</pre>")
	}
	if step.SkippedReason != "" {
		parts = append(parts, "<div class=\"msg\">"+html.EscapeString(step.SkippedReason)+"</div>")
	}
	writeStepOutputs(b, step)
	writeScreenshots(b, step.Screenshots, step.FailureScreenshot)
	if len(parts) == 0 {
		return
	}
	b.WriteString("<div class=\"nested-block ")
	b.WriteString(toneClass(step.Verdict))
	b.WriteString("\">")
	b.WriteString(itemTextHTML(ItemReport{Kind: "step", Step: step}))
	for _, p := range parts {
		b.WriteString(p)
	}
	b.WriteString("</div>\n")
}

func writeStepOutputs(b *bytes.Buffer, step *StepReport) {
	var lines []string
	for _, m := range step.PreHookMessages {
		if m != "" {
			lines = append(lines, m)
		}
	}
	for _, m := range step.Messages {
		if m != "" {
			lines = append(lines, m)
		}
	}
	for _, m := range step.PostHookMessages {
		if m != "" {
			lines = append(lines, m)
		}
	}
	if len(lines) == 0 {
		return
	}
	b.WriteString("<div class=\"out-card\"><div class=\"out-card-label\">输出</div><div class=\"out-card-body\">")
	b.WriteString(html.EscapeString(strings.Join(lines, "\n")))
	b.WriteString("</div></div>\n")
}

func writeScreenshots(b *bytes.Buffer, shots []string, failure string) {
	paths := append([]string{}, shots...)
	if failure != "" {
		paths = append(paths, failure)
	}
	if len(paths) == 0 {
		return
	}
	b.WriteString("<div class=\"shots\">")
	for _, p := range paths {
		if p == "" {
			continue
		}
		b.WriteString("<img src=\"")
		b.WriteString(html.EscapeString(p))
		b.WriteString("\" alt=\"screenshot\">")
	}
	b.WriteString("</div>\n")
}

func writeDataKV(b *bytes.Buffer, headers, cells []string) {
	b.WriteString("<table class=\"data-kv\"><tr>")
	for _, h := range headers {
		b.WriteString("<th>")
		b.WriteString(html.EscapeString(h))
		b.WriteString("</th>")
	}
	b.WriteString("</tr><tr>")
	for _, c := range cells {
		b.WriteString("<td>")
		b.WriteString(html.EscapeString(c))
		b.WriteString("</td>")
	}
	b.WriteString("</tr></table>\n")
}

func writeDataTable(b *bytes.Buffer, dt *DataTable) {
	if dt == nil {
		return
	}
	b.WriteString("<table class=\"data-kv\"><tr>")
	for _, h := range dt.Headers {
		b.WriteString("<th>")
		b.WriteString(html.EscapeString(h))
		b.WriteString("</th>")
	}
	b.WriteString("</tr>")
	for _, row := range dt.Rows {
		b.WriteString("<tr>")
		for _, c := range row {
			b.WriteString("<td>")
			b.WriteString(html.EscapeString(c))
			b.WriteString("</td>")
		}
		b.WriteString("</tr>")
	}
	b.WriteString("</table>\n")
}

func itemVerdict(item ItemReport) string {
	if item.Kind == "step" && item.Step != nil {
		return item.Step.Verdict
	}
	if item.Kind == "concept" && item.Concept != nil && item.Concept.Step != nil {
		return item.Concept.Step.Verdict
	}
	return VerdictNone
}

func itemTextHTML(item ItemReport) string {
	if item.Kind == "comment" {
		return html.EscapeString(item.Comment)
	}
	if item.Step != nil {
		return stepTextHTML(item.Step)
	}
	if item.Concept != nil && item.Concept.Step != nil {
		return stepTextHTML(item.Concept.Step)
	}
	return ""
}

func stepTextHTML(step *StepReport) string {
	if len(step.Fragments) > 0 {
		var parts []string
		for _, f := range step.Fragments {
			switch f.Kind {
			case "text":
				parts = append(parts, html.EscapeString(f.Text))
			default:
				parts = append(parts, "<span class=\"frag "+html.EscapeString(f.Kind)+"\">"+html.EscapeString(f.Text)+"</span>")
			}
		}
		return strings.Join(parts, "")
	}
	return html.EscapeString(fallback(step.ActualText, step.ParsedText))
}

func verdictLabel(v string) string {
	switch v {
	case VerdictPass:
		return "通过"
	case VerdictFail:
		return "失败"
	case VerdictSkip:
		return "跳过"
	default:
		return "—"
	}
}

func toneClass(v string) string {
	switch v {
	case VerdictPass:
		return "tone-pass"
	case VerdictFail:
		return "tone-fail"
	case VerdictSkip:
		return "tone-skip"
	default:
		return "tone-none"
	}
}
