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

//go:embed static_report.js
var staticReportJS string

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
	writeFilterToolbar(&b, r.Summary.Steps)
	b.WriteString("<main class=\"result-pane\">\n")
	writeHookAlert(&b, r.PreHookFailure, "Before Suite")
	writeHookAlert(&b, r.PostHookFailure, "After Suite")
	for i := range r.Specs {
		writeSpecBlock(&b, &r.Specs[i], i == 0)
	}
	b.WriteString("</main>\n")
	writeStaticFooter(&b, r)
	b.WriteString("<script>\n")
	b.WriteString(staticReportJS)
	b.WriteString("</script>\n")
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
	writeReportBlockOpen(b, tone, spec.Verdict, "spec", open)
	writeBlockSummary(b, html.EscapeString(spec.Heading), "规格书", spec.Verdict, spec.Duration)
	b.WriteString("<div class=\"block-body\">\n")
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

func writeBlockSummary(b *bytes.Buffer, name, typeLabel, verdict, duration string) {
	b.WriteString("<summary><span class=\"summary-left\"><span class=\"name-cell\">")
	b.WriteString(name) // name may contain HTML from stepTextHTML for steps
	b.WriteString("</span></span><span class=\"summary-right\"><span class=\"type-label\">")
	b.WriteString(html.EscapeString(typeLabel))
	b.WriteString("</span><span class=\"badge ")
	b.WriteString(html.EscapeString(verdict))
	b.WriteString("\">")
	b.WriteString(html.EscapeString(verdictLabel(verdict)))
	b.WriteString("</span><span class=\"dur\">")
	b.WriteString(html.EscapeString(duration))
	b.WriteString("</span></span></summary>\n")
}

func writeBodyRow(b *bytes.Buffer, row bodyRow) {
	if row.kind == "scenario" && len(row.scenarios) == 1 {
		writeScenarioBlock(b, row.scenarios[0], row.verdict == VerdictFail)
		return
	}
	kind := row.kind
	if kind == "" {
		kind = "scenario"
	}
	tone := toneClass(row.verdict)
	writeReportBlockOpen(b, tone, row.verdict, kind, false)
	writeBlockSummary(b, html.EscapeString(bodyName(row)), bodyTypeLabel(row), row.verdict, row.duration)
	b.WriteString("<div class=\"block-body\">\n")
	if row.kind == "datarow" && len(row.headers) > 0 {
		writeDataKV(b, row.headers, row.cells)
	}
	for _, scn := range row.scenarios {
		writeScenarioBlock(b, scn, scn.Verdict == VerdictFail)
	}
	b.WriteString("</div></details>\n")
}

func writeScenarioBlock(b *bytes.Buffer, scn ScenarioReport, open bool) {
	tone := toneClass(scn.Verdict)
	writeReportBlockOpen(b, tone, scn.Verdict, "scenario", open)
	writeBlockSummary(b, html.EscapeString(scn.Heading), "场景", scn.Verdict, scn.Duration)
	b.WriteString("<div class=\"block-body\">\n")
	writeHookAlert(b, scn.PreHookFailure, "Before Scenario")
	writeHookAlert(b, scn.PostHookFailure, "After Scenario")
	if scn.ScenarioDataTable != nil {
		writeDataTable(b, scn.ScenarioDataTable)
	}
	for _, row := range scenarioPhaseItems(scn) {
		writeItemBlock(b, row.phase, row.item)
	}
	b.WriteString("</div></details>\n")
}

func writeItemBlock(b *bytes.Buffer, phase string, item ItemReport) {
	switch item.Kind {
	case "comment":
		if item.Comment != "" {
			b.WriteString("<div class=\"comment\">")
			b.WriteString(html.EscapeString(item.Comment))
			b.WriteString("</div>\n")
		}
		return
	case "concept":
		writeConceptBlock(b, item)
		return
	case "step":
		writeStepBlock(b, phase, item)
		return
	}
}

func itemTypeLabel(phase string, item ItemReport) string {
	if item.Kind == "concept" {
		return "概念"
	}
	switch phase {
	case "Context":
		return "前置"
	case "Teardown":
		return "清理"
	default:
		return "步骤"
	}
}

func writeConceptBlock(b *bytes.Buffer, item ItemReport) {
	concept := item.Concept
	if concept == nil {
		return
	}
	verdict := itemVerdict(item)
	tone := toneClass(verdict)
	name := itemTextHTML(item)
	open := verdict == VerdictFail
	writeReportBlockOpen(b, tone, verdict, "concept", open)
	writeBlockSummary(b, name, "概念", verdict, itemDurationStr(item))
	b.WriteString("<div class=\"block-body\">\n")
	for _, child := range concept.Items {
		writeItemBlock(b, "", child)
	}
	if concept.Step != nil {
		writeStepExtras(b, concept.Step)
	}
	b.WriteString("</div></details>\n")
}

func writeStepBlock(b *bytes.Buffer, phase string, item ItemReport) {
	step := item.Step
	if step == nil {
		return
	}
	verdict := step.Verdict
	tone := toneClass(verdict)
	name := stepTextHTML(step)
	open := verdict == VerdictFail
	writeReportBlockOpen(b, tone, verdict, "step", open)
	writeBlockSummary(b, name, itemTypeLabel(phase, item), verdict, itemDurationStr(item))
	b.WriteString("<div class=\"block-body\">\n")
	writeStepExtras(b, step)
	b.WriteString("</div></details>\n")
}

func writeStepExtras(b *bytes.Buffer, step *StepReport) {
	if step == nil {
		return
	}
	if step.ErrorMessage != "" {
		b.WriteString("<div class=\"err\">")
		b.WriteString(html.EscapeString(step.ErrorMessage))
		b.WriteString("</div>\n")
	}
	if step.StackTrace != "" {
		b.WriteString("<pre class=\"stack\">")
		b.WriteString(html.EscapeString(step.StackTrace))
		b.WriteString("</pre>\n")
	}
	if step.SkippedReason != "" {
		b.WriteString("<div class=\"msg\">")
		b.WriteString(html.EscapeString(step.SkippedReason))
		b.WriteString("</div>\n")
	}
	writeHookAlert(b, step.PreHookFailure, "Before Step")
	writeHookAlert(b, step.PostHookFailure, "After Step")
	writeStepOutputs(b, step)
	writeScreenshots(b, step.Screenshots, step.FailureScreenshot)
}

func itemDurationStr(item ItemReport) string {
	if item.Duration != "" {
		return item.Duration
	}
	if item.Step != nil {
		return item.Step.Duration
	}
	if item.Concept != nil {
		return item.Concept.Duration
	}
	return "00:00:00.000"
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
