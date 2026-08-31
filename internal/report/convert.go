package report

import (
	"fmt"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
)

// FromSuite builds the viewer report model from a Gauge suite result.
func FromSuite(psr *gauge_messages.ProtoSuiteResult) *Report {
	return toReport(psr)
}

func recountReport(r *Report) {
	if r == nil {
		return
	}
	r.Summary = ReportSummary{}
	var totalTime int64
	for i := range r.Specs {
		spec := &r.Specs[i]
		spec.Summary = Counts{}
		totalTime += spec.ExecutionTime
		for j := range spec.Scenarios {
			addCounts(&spec.Summary, spec.Scenarios[j].Verdict)
			stepCounts := countItems(scenarioAllItems(&spec.Scenarios[j]))
			r.Summary.Steps.Passed += stepCounts.Passed
			r.Summary.Steps.Failed += stepCounts.Failed
			r.Summary.Steps.Skipped += stepCounts.Skipped
			r.Summary.Steps.Total += stepCounts.Total
		}
		addCounts(&r.Summary.Specs, spec.Verdict)
		r.Summary.Scenarios.Passed += spec.Summary.Passed
		r.Summary.Scenarios.Failed += spec.Summary.Failed
		r.Summary.Scenarios.Skipped += spec.Summary.Skipped
		r.Summary.Scenarios.Total += spec.Summary.Total
	}
	r.Failed = r.Summary.Specs.Failed > 0
	switch {
	case r.Summary.Specs.Total == 0:
		if r.Verdict == "" {
			r.Verdict = VerdictNone
		}
	case r.Summary.Specs.Failed > 0:
		r.Verdict = VerdictFail
	case r.Summary.Specs.Skipped == r.Summary.Specs.Total:
		r.Verdict = VerdictSkip
	default:
		r.Verdict = VerdictPass
	}
	if r.ExecutionTime == 0 && totalTime > 0 {
		r.ExecutionTime = totalTime
		r.Duration = formatDuration(totalTime)
	}
	if r.Summary.Specs.Total > 0 {
		r.SuccessRate = 100 * float32(r.Summary.Specs.Passed) / float32(r.Summary.Specs.Total)
	} else {
		r.SuccessRate = 0
	}
}

// Recount recomputes summary fields on a report model.
func Recount(r *Report) {
	recountReport(r)
}

func toReport(psr *gauge_messages.ProtoSuiteResult) *Report {
	report := &Report{
		ProjectName:         fallback(psr.GetProjectName(), "Gauge Suite"),
		Environment:         psr.GetEnvironment(),
		Tags:                psr.GetTags(),
		TimestampISO:        psr.GetTimestampISO(),
		Timestamp:           formatTimestamp(psr.GetTimestampISO(), psr.GetTimestamp()),
		ExecutionTime:       psr.GetExecutionTime(),
		Duration:            formatDuration(psr.GetExecutionTime()),
		SuccessRate:         psr.GetSuccessRate(),
		Failed:              psr.GetFailed(),
		Verdict:             suiteVerdict(psr),
		PreHookFailure:      toHookFailure(psr.GetPreHookFailure(), "Before Suite"),
		PostHookFailure:     toHookFailure(psr.GetPostHookFailure(), "After Suite"),
		PreHookMessages:     psr.GetPreHookMessages(),
		PostHookMessages:    psr.GetPostHookMessages(),
		PreHookScreenshots:  append([]string{}, psr.GetPreHookScreenshotFiles()...),
		PostHookScreenshots: append([]string{}, psr.GetPostHookScreenshotFiles()...),
	}

	for i, protoSpec := range psr.GetSpecResults() {
		fileName := ""
		if protoSpec.GetProtoSpec() != nil {
			fileName = protoSpec.GetProtoSpec().GetFileName()
		}
		spec := toSpecReport(specStableID(fileName, i), protoSpec)
		report.Specs = append(report.Specs, spec)
	}
	recountReport(report)
	if psr.GetExecutionTime() > 0 {
		report.ExecutionTime = psr.GetExecutionTime()
		report.Duration = formatDuration(psr.GetExecutionTime())
	}
	if psr.GetSuccessRate() > 0 {
		report.SuccessRate = psr.GetSuccessRate()
	}
	return report
}

func toSpecReport(id string, res *gauge_messages.ProtoSpecResult) SpecReport {
	spec := res.GetProtoSpec()
	heading := strings.TrimSpace(spec.GetSpecHeading())
	if heading == "" {
		heading = filepath.Base(spec.GetFileName())
	}
	out := SpecReport{
		ID:                  id,
		Heading:             heading,
		FileName:            spec.GetFileName(),
		Folders:             specFolders(spec.GetFileName()),
		Tags:                spec.GetTags(),
		ExecutionTime:       res.GetExecutionTime(),
		Duration:            formatDuration(res.GetExecutionTime()),
		Verdict:             specVerdict(res),
		IsTableDriven:       spec.GetIsTableDriven(),
		PreHookMessages:     spec.GetPreHookMessages(),
		PostHookMessages:    spec.GetPostHookMessages(),
		PreHookScreenshots:  append([]string{}, spec.GetPreHookScreenshotFiles()...),
		PostHookScreenshots: append([]string{}, spec.GetPostHookScreenshotFiles()...),
	}
	for _, err := range res.GetErrors() {
		out.Errors = append(out.Errors, BuildError{
			Type:       err.GetType().String(),
			FileName:   err.GetFilename(),
			LineNumber: int(err.GetLineNumber()),
			Message:    err.GetMessage(),
		})
	}
	for _, f := range spec.GetPreHookFailures() {
		out.PreHookFailures = append(out.PreHookFailures, toHookFailure(f, "Before Spec"))
	}
	for _, f := range spec.GetPostHookFailures() {
		out.PostHookFailures = append(out.PostHookFailures, toHookFailure(f, "After Spec"))
	}

	scnIndex := 0
	for _, item := range spec.GetItems() {
		switch item.GetItemType() {
		case gauge_messages.ProtoItem_Table:
			out.Datatable = toDataTable(item.GetTable())
		case gauge_messages.ProtoItem_Scenario:
			scn := toScenarioReport(fmt.Sprintf("%s-scn-%d", id, scnIndex), item.GetScenario(), -1, nil)
			out.Scenarios = append(out.Scenarios, scn)
			addCounts(&out.Summary, scn.Verdict)
			scnIndex++
		case gauge_messages.ProtoItem_TableDrivenScenario:
			td := item.GetTableDrivenScenario()
			rowIndex := -1
			if td.GetIsSpecTableDriven() {
				rowIndex = int(td.GetTableRowIndex())
			}
			scn := toScenarioReport(fmt.Sprintf("%s-scn-%d", id, scnIndex), td.GetScenario(), rowIndex, td)
			out.Scenarios = append(out.Scenarios, scn)
			addCounts(&out.Summary, scn.Verdict)
			scnIndex++
		}
	}
	if out.ExecutionTime == 0 {
		var sum int64
		for _, scn := range out.Scenarios {
			sum += scn.ExecutionTime
		}
		out.ExecutionTime = sum
		out.Duration = formatDuration(sum)
	}
	return out
}

func toScenarioReport(id string, scn *gauge_messages.ProtoScenario, tableRowIndex int, td *gauge_messages.ProtoTableDrivenScenario) ScenarioReport {
	out := ScenarioReport{
		ID:                  id,
		Heading:             scn.GetScenarioHeading(),
		Tags:                scn.GetTags(),
		ExecutionTime:       scn.GetExecutionTime(),
		Duration:            formatDuration(scn.GetExecutionTime()),
		Verdict:             scenarioVerdict(scn),
		TableRowIndex:       tableRowIndex,
		RetriesCount:        scn.GetRetriesCount(),
		Contexts:            toItemReports(id+"-ctx", scn.GetContexts()),
		Items:               toItemReports(id+"-i", scn.GetScenarioItems()),
		Teardowns:           toItemReports(id+"-td", scn.GetTearDownSteps()),
		SkipErrors:          scn.GetSkipErrors(),
		PreHookFailure:      toHookFailure(scn.GetPreHookFailure(), "Before Scenario"),
		PostHookFailure:     toHookFailure(scn.GetPostHookFailure(), "After Scenario"),
		PreHookMessages:     scn.GetPreHookMessages(),
		PostHookMessages:    scn.GetPostHookMessages(),
		PreHookScreenshots:  append([]string{}, scn.GetPreHookScreenshotFiles()...),
		PostHookScreenshots: append([]string{}, scn.GetPostHookScreenshotFiles()...),
	}
	if td != nil && td.GetIsScenarioTableDriven() {
		out.IsScenarioTableDriven = true
		out.ScenarioTableRowIndex = int(td.GetScenarioTableRowIndex())
		out.ScenarioDataTable = toDataTable(td.GetScenarioDataTable())
	}
	sum := fillItemDurations(out.Contexts) + fillItemDurations(out.Items) + fillItemDurations(out.Teardowns)
	if out.ExecutionTime == 0 && sum > 0 {
		out.ExecutionTime = sum
		out.Duration = formatDuration(sum)
	}
	return out
}

func toItemReports(prefix string, items []*gauge_messages.ProtoItem) []ItemReport {
	out := make([]ItemReport, 0, len(items))
	for i, item := range items {
		id := fmt.Sprintf("%s-%d", prefix, i)
		switch item.GetItemType() {
		case gauge_messages.ProtoItem_Step:
			out = append(out, ItemReport{ID: id, Kind: "step", Step: toStepReport(item.GetStep())})
		case gauge_messages.ProtoItem_Concept:
			c := toConceptReport(id, item.GetConcept())
			out = append(out, ItemReport{ID: id, Kind: "concept", Concept: c})
		case gauge_messages.ProtoItem_Comment:
			text := strings.TrimSpace(item.GetComment().GetText())
			if text != "" {
				out = append(out, ItemReport{ID: id, Kind: "comment", Comment: text})
			}
		}
	}
	return out
}

func toConceptReport(id string, c *gauge_messages.ProtoConcept) *ConceptReport {
	step := c.GetConceptStep()
	if step != nil && c.GetConceptExecutionResult() != nil {
		step.StepExecutionResult = c.GetConceptExecutionResult()
	}
	return &ConceptReport{
		Step:  toStepReport(step),
		Items: toItemReports(id, c.GetSteps()),
	}
}

func toStepReport(step *gauge_messages.ProtoStep) *StepReport {
	if step == nil {
		return &StepReport{Verdict: VerdictNone, Duration: formatDuration(0)}
	}
	exec := step.GetStepExecutionResult()
	res := exec.GetExecutionResult()
	out := &StepReport{
		ActualText:          step.GetActualText(),
		ParsedText:          step.GetParsedText(),
		Fragments:           toFragments(step.GetFragments()),
		Verdict:             stepVerdict(exec),
		PreHookFailure:      toHookFailure(exec.GetPreHookFailure(), "Before Step"),
		PostHookFailure:     toHookFailure(exec.GetPostHookFailure(), "After Step"),
		PreHookMessages:     step.GetPreHookMessages(),
		PostHookMessages:    step.GetPostHookMessages(),
		PreHookScreenshots:  append([]string{}, step.GetPreHookScreenshotFiles()...),
		PostHookScreenshots: append([]string{}, step.GetPostHookScreenshotFiles()...),
	}
	if exec.GetSkipped() {
		out.SkippedReason = exec.GetSkippedReason()
	}
	if res != nil {
		out.ExecutionTime = res.GetExecutionTime()
		out.ErrorMessage = res.GetErrorMessage()
		out.StackTrace = res.GetStackTrace()
		out.Messages = res.GetMessage()
		out.FailureScreenshot = res.GetFailureScreenshotFile()
		out.Screenshots = append([]string{}, res.GetScreenshotFiles()...)
	}
	out.Duration = formatDuration(out.ExecutionTime)
	return out
}

func toFragments(fragments []*gauge_messages.Fragment) []FragmentReport {
	out := make([]FragmentReport, 0, len(fragments))
	for _, f := range fragments {
		switch f.GetFragmentType() {
		case gauge_messages.Fragment_Text:
			out = append(out, FragmentReport{Kind: "text", Text: f.GetText()})
		case gauge_messages.Fragment_Parameter:
			p := f.GetParameter()
			fr := FragmentReport{Text: p.GetValue(), Name: p.GetName()}
			switch p.GetParameterType() {
			case gauge_messages.Parameter_Static:
				fr.Kind = "static"
			case gauge_messages.Parameter_Dynamic:
				fr.Kind = "dynamic"
			case gauge_messages.Parameter_Table, gauge_messages.Parameter_Special_Table:
				fr.Kind = "table"
				fr.Table = toDataTable(p.GetTable())
			case gauge_messages.Parameter_Special_String:
				if strings.Contains(p.GetValue(), "\n") {
					fr.Kind = "multiline"
				} else {
					fr.Kind = "special"
				}
			case gauge_messages.Parameter_Multiline_String:
				fr.Kind = "multiline"
			default:
				fr.Kind = "static"
			}
			out = append(out, fr)
		}
	}
	return out
}

func toDataTable(t *gauge_messages.ProtoTable) *DataTable {
	if t == nil {
		return nil
	}
	out := &DataTable{Headers: t.GetHeaders().GetCells()}
	for _, row := range t.GetRows() {
		out.Rows = append(out.Rows, append([]string{}, row.GetCells()...))
	}
	return out
}

func toHookFailure(f *gauge_messages.ProtoHookFailure, name string) *HookFailure {
	if f == nil {
		return nil
	}
	return &HookFailure{
		HookName:          name,
		ErrorMessage:      f.GetErrorMessage(),
		StackTrace:        f.GetStackTrace(),
		FailureScreenshot: f.GetFailureScreenshotFile(),
		TableRowIndex:     f.GetTableRowIndex(),
	}
}

func suiteVerdict(psr *gauge_messages.ProtoSuiteResult) string {
	if psr.GetFailed() || psr.GetSpecsFailedCount() > 0 {
		return VerdictFail
	}
	if len(psr.GetSpecResults()) == 0 {
		return VerdictNone
	}
	if int(psr.GetSpecsSkippedCount()) == len(psr.GetSpecResults()) {
		return VerdictSkip
	}
	return VerdictPass
}

func specVerdict(res *gauge_messages.ProtoSpecResult) string {
	if res.GetFailed() {
		return VerdictFail
	}
	if res.GetSkipped() {
		return VerdictSkip
	}
	return VerdictPass
}

func scenarioVerdict(scn *gauge_messages.ProtoScenario) string {
	switch scn.GetExecutionStatus() {
	case gauge_messages.ExecutionStatus_FAILED:
		return VerdictFail
	case gauge_messages.ExecutionStatus_SKIPPED:
		return VerdictSkip
	case gauge_messages.ExecutionStatus_PASSED:
		return VerdictPass
	default:
		if scn.GetFailed() {
			return VerdictFail
		}
		if scn.GetSkipped() {
			return VerdictSkip
		}
		return VerdictNone
	}
}

func stepVerdict(res *gauge_messages.ProtoStepExecutionResult) string {
	if res == nil {
		return VerdictNone
	}
	if res.GetSkipped() {
		return VerdictSkip
	}
	if res.GetExecutionResult() == nil {
		return VerdictNone
	}
	if res.GetExecutionResult().GetFailed() {
		return VerdictFail
	}
	return VerdictPass
}

func specFolders(fileName string) []string {
	cleaned := strings.ReplaceAll(filepath.ToSlash(strings.TrimSpace(fileName)), "\\", "/")
	if cleaned == "" {
		return nil
	}
	dir := path.Dir(cleaned)
	if dir == "." || dir == "/" || dir == "" {
		return nil
	}
	dir = strings.Trim(dir, "/")
	if dir == "" {
		return nil
	}
	parts := strings.Split(dir, "/")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p == "" || p == "." {
			continue
		}
		out = append(out, p)
	}
	return out
}

func fillItemDurations(items []ItemReport) int64 {
	var total int64
	for i := range items {
		total += fillOneItemDuration(&items[i])
	}
	return total
}

func fillOneItemDuration(item *ItemReport) int64 {
	var t int64
	switch item.Kind {
	case "step":
		if item.Step != nil {
			t = item.Step.ExecutionTime
		}
	case "concept":
		if item.Concept != nil {
			child := fillItemDurations(item.Concept.Items)
			if item.Concept.Step != nil {
				t = item.Concept.Step.ExecutionTime
				if t == 0 {
					t = child
					item.Concept.Step.ExecutionTime = t
					item.Concept.Step.Duration = formatDuration(t)
				}
			} else {
				t = child
			}
			item.Concept.ExecutionTime = t
			item.Concept.Duration = formatDuration(t)
		}
	}
	item.ExecutionTime = t
	item.Duration = formatDuration(t)
	return t
}

func scenarioAllItems(scn *ScenarioReport) []ItemReport {
	out := make([]ItemReport, 0, len(scn.Contexts)+len(scn.Items)+len(scn.Teardowns))
	out = append(out, scn.Contexts...)
	out = append(out, scn.Items...)
	out = append(out, scn.Teardowns...)
	return out
}

func addCounts(c *Counts, verdict string) {
	c.Total++
	switch verdict {
	case VerdictPass:
		c.Passed++
	case VerdictFail:
		c.Failed++
	case VerdictSkip:
		c.Skipped++
	}
}

func countItems(items []ItemReport) Counts {
	var c Counts
	var walk func([]ItemReport)
	walk = func(list []ItemReport) {
		for _, item := range list {
			switch item.Kind {
			case "step":
				if item.Step != nil {
					addCounts(&c, item.Step.Verdict)
				}
			case "concept":
				if item.Concept != nil {
					if item.Concept.Step != nil {
						addCounts(&c, item.Concept.Step.Verdict)
					}
					walk(item.Concept.Items)
				}
			}
		}
	}
	walk(items)
	return c
}

func formatDuration(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	d := time.Duration(ms) * time.Millisecond
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := d.Seconds() - float64(h*3600+m*60)
	return fmt.Sprintf("%02d:%02d:%06.3f", h, m, s)
}

func formatTimestamp(iso, fallbackValue string) string {
	if iso != "" {
		if t, err := time.Parse(time.RFC3339Nano, iso); err == nil {
			return t.Local().Format("2006-01-02 15:04:05")
		}
		if t, err := time.Parse(time.RFC3339, iso); err == nil {
			return t.Local().Format("2006-01-02 15:04:05")
		}
	}
	if fallbackValue != "" {
		return fallbackValue
	}
	return time.Now().Format("2006-01-02 15:04:05")
}

func fallback(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

