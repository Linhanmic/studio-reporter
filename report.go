package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

const (
	verdictPass              = "pass"
	verdictFail              = "fail"
	verdictSkip              = "skip"
	verdictNone              = "none"
	reportsDirEnv            = "gauge_reports_dir"
	overwriteReportsEnv      = "overwrite_reports"
	overwriteReportsEnvAlias = "over_write_reports"
	gaugeProjectRootEnv      = "GAUGE_PROJECT_ROOT"
	skipReportEnv            = "GAUGE_STUDIO_SKIP_REPORT"
	defaultReportsDir        = "reports"
	reportFolderName         = "studio-report"
	reportIndexFile          = "index.html"
	reportJSONFile           = "last_run_result.json"
	liveReportJSONFile       = "report.json"
	liveReportJSFile         = "report-live.js"
	reportTimeLayout         = "2006-01-02_15.04.05"
)

// Report is the JSON model consumed by the CANoe-style HTML viewer.
type Report struct {
	ProjectName         string        `json:"projectName"`
	Environment         string        `json:"environment"`
	Tags                string        `json:"tags"`
	Timestamp           string        `json:"timestamp"`
	TimestampISO        string        `json:"timestampISO"`
	ExecutionTime       int64         `json:"executionTime"`
	Duration            string        `json:"duration"`
	SuccessRate         float32       `json:"successRate"`
	Failed              bool          `json:"failed"`
	Verdict             string        `json:"verdict"`
	Specs               []SpecReport  `json:"specs"`
	Summary             ReportSummary `json:"summary"`
	PreHookFailure      *HookFailure  `json:"preHookFailure,omitempty"`
	PostHookFailure     *HookFailure  `json:"postHookFailure,omitempty"`
	PreHookMessages     []string      `json:"preHookMessages,omitempty"`
	PostHookMessages    []string      `json:"postHookMessages,omitempty"`
	PreHookScreenshots  []string      `json:"preHookScreenshots,omitempty"`
	PostHookScreenshots []string      `json:"postHookScreenshots,omitempty"`
}

type ReportSummary struct {
	Specs     Counts `json:"specs"`
	Scenarios Counts `json:"scenarios"`
	Steps     Counts `json:"steps"`
}

type Counts struct {
	Total   int `json:"total"`
	Passed  int `json:"passed"`
	Failed  int `json:"failed"`
	Skipped int `json:"skipped"`
}

type SpecReport struct {
	ID                  string           `json:"id"`
	Heading             string           `json:"heading"`
	FileName            string           `json:"fileName"`
	Folders             []string         `json:"folders,omitempty"`
	Tags                []string         `json:"tags,omitempty"`
	ExecutionTime       int64            `json:"executionTime"`
	Duration            string           `json:"duration"`
	Verdict             string           `json:"verdict"`
	IsTableDriven       bool             `json:"isTableDriven,omitempty"`
	Scenarios           []ScenarioReport `json:"scenarios"`
	Summary             Counts           `json:"summary"`
	Errors              []BuildError     `json:"errors,omitempty"`
	Datatable           *DataTable       `json:"datatable,omitempty"`
	PreHookFailures     []*HookFailure   `json:"preHookFailures,omitempty"`
	PostHookFailures    []*HookFailure   `json:"postHookFailures,omitempty"`
	PreHookMessages     []string         `json:"preHookMessages,omitempty"`
	PostHookMessages    []string         `json:"postHookMessages,omitempty"`
	PreHookScreenshots  []string         `json:"preHookScreenshots,omitempty"`
	PostHookScreenshots []string         `json:"postHookScreenshots,omitempty"`
}

type ScenarioReport struct {
	ID                    string       `json:"id"`
	Heading               string       `json:"heading"`
	Tags                  []string     `json:"tags,omitempty"`
	ExecutionTime         int64        `json:"executionTime"`
	Duration              string       `json:"duration"`
	Verdict               string       `json:"verdict"`
	TableRowIndex         int          `json:"tableRowIndex"`
	RetriesCount          int64        `json:"retriesCount,omitempty"`
	Contexts              []ItemReport `json:"contexts,omitempty"`
	Items                 []ItemReport `json:"items"`
	Teardowns             []ItemReport `json:"teardowns,omitempty"`
	SkipErrors            []string     `json:"skipErrors,omitempty"`
	PreHookFailure        *HookFailure `json:"preHookFailure,omitempty"`
	PostHookFailure       *HookFailure `json:"postHookFailure,omitempty"`
	PreHookMessages       []string     `json:"preHookMessages,omitempty"`
	PostHookMessages      []string     `json:"postHookMessages,omitempty"`
	PreHookScreenshots    []string     `json:"preHookScreenshots,omitempty"`
	PostHookScreenshots   []string     `json:"postHookScreenshots,omitempty"`
	IsScenarioTableDriven bool         `json:"isScenarioTableDriven,omitempty"`
	ScenarioTableRowIndex int          `json:"scenarioTableRowIndex,omitempty"`
	ScenarioDataTable     *DataTable   `json:"scenarioDataTable,omitempty"`
}

type ItemReport struct {
	ID            string         `json:"id"`
	Kind          string         `json:"kind"`
	ExecutionTime int64          `json:"executionTime"`
	Duration      string         `json:"duration"`
	Step          *StepReport    `json:"step,omitempty"`
	Concept       *ConceptReport `json:"concept,omitempty"`
	Comment       string         `json:"comment,omitempty"`
}

type ConceptReport struct {
	Step          *StepReport  `json:"step"`
	Items         []ItemReport `json:"items"`
	ExecutionTime int64        `json:"executionTime"`
	Duration      string       `json:"duration"`
}

type StepReport struct {
	ActualText          string           `json:"actualText"`
	ParsedText          string           `json:"parsedText"`
	Fragments           []FragmentReport `json:"fragments,omitempty"`
	Verdict             string           `json:"verdict"`
	ExecutionTime       int64            `json:"executionTime"`
	Duration            string           `json:"duration"`
	ErrorMessage        string           `json:"errorMessage,omitempty"`
	StackTrace          string           `json:"stackTrace,omitempty"`
	SkippedReason       string           `json:"skippedReason,omitempty"`
	Messages            []string         `json:"messages,omitempty"`
	Screenshots         []string         `json:"screenshots,omitempty"`
	FailureScreenshot   string           `json:"failureScreenshot,omitempty"`
	PreHookFailure      *HookFailure     `json:"preHookFailure,omitempty"`
	PostHookFailure     *HookFailure     `json:"postHookFailure,omitempty"`
	PreHookMessages     []string         `json:"preHookMessages,omitempty"`
	PostHookMessages    []string         `json:"postHookMessages,omitempty"`
	PreHookScreenshots  []string         `json:"preHookScreenshots,omitempty"`
	PostHookScreenshots []string         `json:"postHookScreenshots,omitempty"`
}

type FragmentReport struct {
	Kind  string     `json:"kind"`
	Text  string     `json:"text,omitempty"`
	Name  string     `json:"name,omitempty"`
	Table *DataTable `json:"table,omitempty"`
}

type DataTable struct {
	Headers []string   `json:"headers"`
	Rows    [][]string `json:"rows"`
}

type HookFailure struct {
	HookName          string `json:"hookName"`
	ErrorMessage      string `json:"errorMessage"`
	StackTrace        string `json:"stackTrace,omitempty"`
	FailureScreenshot string `json:"failureScreenshot,omitempty"`
	TableRowIndex     int32  `json:"tableRowIndex"`
}

type BuildError struct {
	Type       string `json:"type"`
	FileName   string `json:"fileName"`
	LineNumber int    `json:"lineNumber"`
	Message    string `json:"message"`
}

type GeneratedReport struct {
	Dir       string
	IndexPath string
	JSONPath  string
}

func writeReportAssets(dir string) error {
	destDir := filepath.Join(dir, "assets")
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return fmt.Errorf("create assets directory: %w", err)
	}
	entries, err := reportAssets.ReadDir("report-assets")
	if err != nil {
		return fmt.Errorf("read embedded assets: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		data, err := reportAssets.ReadFile(path.Join("report-assets", name))
		if err != nil {
			return fmt.Errorf("read asset %s: %w", name, err)
		}
		if err := os.WriteFile(filepath.Join(destDir, name), data, 0o644); err != nil {
			return fmt.Errorf("write asset %s: %w", name, err)
		}
	}
	return nil
}

func shouldSkipReport() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(skipReportEnv)))
	return v == "true" || v == "1" || v == "yes"
}

func generateReportFromSuite(req *gauge_messages.SuiteExecutionResult) (*GeneratedReport, error) {
	return generateReportFromSuiteTo(req, "")
}

func generateReportFromSuiteTo(req *gauge_messages.SuiteExecutionResult, dir string) (*GeneratedReport, error) {
	if req == nil || req.GetSuiteResult() == nil {
		return nil, fmt.Errorf("suite result is empty")
	}
	report := toReport(req.GetSuiteResult())
	if dir == "" {
		var err error
		dir, err = resolveReportDir()
		if err != nil {
			return nil, err
		}
	} else if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create report directory: %w", err)
	}
	return writeReport(dir, report, req)
}

func generateReportFromJSON(inputPath, outputDir string) (*GeneratedReport, error) {
	data, err := os.ReadFile(inputPath)
	if err != nil {
		return nil, fmt.Errorf("read input: %w", err)
	}
	var suite gauge_messages.SuiteExecutionResult
	if err := protojson.Unmarshal(data, &suite); err != nil {
		return nil, fmt.Errorf("parse suite result JSON: %w", err)
	}
	if suite.GetSuiteResult() == nil {
		return nil, fmt.Errorf("input JSON does not contain a suiteResult")
	}
	if outputDir == "" {
		outputDir, err = resolveReportDir()
		if err != nil {
			return nil, err
		}
	} else if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return nil, fmt.Errorf("create output directory: %w", err)
	}
	return writeReport(outputDir, toReport(suite.GetSuiteResult()), &suite)
}

func writeReport(dir string, report *Report, src proto.Message) (*GeneratedReport, error) {
	imagesDir := filepath.Join(dir, "images")
	if err := os.MkdirAll(imagesDir, 0o755); err != nil {
		return nil, fmt.Errorf("create report directory: %w", err)
	}
	if err := writeReportAssets(dir); err != nil {
		return nil, err
	}
	rewriteScreenshotPaths(report, copyScreenshots(collectScreenshotFiles(report), imagesDir))

	indexPath := filepath.Join(dir, reportIndexFile)
	html, err := renderReportHTML(report)
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(indexPath, html, 0o644); err != nil {
		return nil, fmt.Errorf("write index.html: %w", err)
	}

	jsonPath := filepath.Join(dir, reportJSONFile)
	payload, err := protoMarshalOptions.Marshal(src)
	if err != nil {
		return nil, fmt.Errorf("marshal suite result: %w", err)
	}
	if err := os.WriteFile(jsonPath, payload, 0o644); err != nil {
		return nil, fmt.Errorf("write last_run_result.json: %w", err)
	}
	if err := writeLiveSnapshot(dir, &LiveSnapshot{Rev: time.Now().UnixMilli(), Running: false, Report: report}); err != nil {
		return nil, err
	}

	log.Printf("studio-reporter: HTML report written to %s", indexPath)
	if err := recordCompletedRun(dir, report); err != nil {
		log.Printf("studio-reporter: history: %v", err)
	}
	openReportPage(indexPath)
	return &GeneratedReport{Dir: dir, IndexPath: indexPath, JSONPath: jsonPath}, nil
}

func resolveReportDir() (string, error) {
	abs, err := reportsBaseDir()
	if err != nil {
		return "", err
	}
	current := filepath.Join(abs, reportFolderName)
	overwrite := shouldOverwriteReports()
	if !overwrite {
		stamp := time.Now().Format(reportTimeLayout)
		current = filepath.Join(current, stamp)
		for i := 1; dirExists(current); i++ {
			current = filepath.Join(abs, reportFolderName, fmt.Sprintf("%s-%d", stamp, i))
		}
	}
	if err := os.MkdirAll(current, 0o755); err != nil {
		return "", fmt.Errorf("create reports dir: %w", err)
	}
	log.Printf("studio-reporter: report directory %s (overwrite=%v)", current, overwrite)
	return current, nil
}

func reportsBaseDir() (string, error) {
	base := firstNonEmptyEnv(reportsDirEnv)
	if base == "" {
		base = defaultReportsDir
	}
	if !filepath.IsAbs(base) {
		if root := strings.TrimSpace(os.Getenv(gaugeProjectRootEnv)); root != "" {
			base = filepath.Join(root, base)
		}
	}
	abs, err := filepath.Abs(base)
	if err != nil {
		return "", fmt.Errorf("resolve reports dir: %w", err)
	}
	return abs, nil
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func firstNonEmptyEnv(names ...string) string {
	for _, name := range names {
		if v, ok := os.LookupEnv(name); ok {
			if s := strings.TrimSpace(v); s != "" {
				return s
			}
		}
	}
	return ""
}

func shouldOverwriteReports() bool {
	v := strings.ToLower(firstNonEmptyEnv(overwriteReportsEnv, overwriteReportsEnvAlias))
	if v == "" {
		return true
	}
	return v == "true" || v == "1" || v == "yes" || v == "on"
}

func specStableID(fileName string, fallbackIndex int) string {
	f := filepath.ToSlash(strings.TrimSpace(fileName))
	if f == "" || f == "." {
		return fmt.Sprintf("spec-%d", fallbackIndex)
	}
	return "spec:" + f
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
			r.Verdict = verdictNone
		}
	case r.Summary.Specs.Failed > 0:
		r.Verdict = verdictFail
	case r.Summary.Specs.Skipped == r.Summary.Specs.Total:
		r.Verdict = verdictSkip
	default:
		r.Verdict = verdictPass
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
		return &StepReport{Verdict: verdictNone, Duration: formatDuration(0)}
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
		return verdictFail
	}
	if len(psr.GetSpecResults()) == 0 {
		return verdictNone
	}
	if int(psr.GetSpecsSkippedCount()) == len(psr.GetSpecResults()) {
		return verdictSkip
	}
	return verdictPass
}

func specVerdict(res *gauge_messages.ProtoSpecResult) string {
	if res.GetFailed() {
		return verdictFail
	}
	if res.GetSkipped() {
		return verdictSkip
	}
	return verdictPass
}

func scenarioVerdict(scn *gauge_messages.ProtoScenario) string {
	switch scn.GetExecutionStatus() {
	case gauge_messages.ExecutionStatus_FAILED:
		return verdictFail
	case gauge_messages.ExecutionStatus_SKIPPED:
		return verdictSkip
	case gauge_messages.ExecutionStatus_PASSED:
		return verdictPass
	default:
		if scn.GetFailed() {
			return verdictFail
		}
		if scn.GetSkipped() {
			return verdictSkip
		}
		return verdictNone
	}
}

func stepVerdict(res *gauge_messages.ProtoStepExecutionResult) string {
	if res == nil {
		return verdictNone
	}
	if res.GetSkipped() {
		return verdictSkip
	}
	if res.GetExecutionResult() == nil {
		return verdictNone
	}
	if res.GetExecutionResult().GetFailed() {
		return verdictFail
	}
	return verdictPass
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
	case verdictPass:
		c.Passed++
	case verdictFail:
		c.Failed++
	case verdictSkip:
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

func collectScreenshotFiles(r *Report) []string {
	seen := map[string]struct{}{}
	var files []string
	add := func(paths ...string) {
		for _, p := range paths {
			if p == "" {
				continue
			}
			if _, ok := seen[p]; ok {
				continue
			}
			seen[p] = struct{}{}
			files = append(files, p)
		}
	}
	add(r.PreHookScreenshots...)
	add(r.PostHookScreenshots...)
	if r.PreHookFailure != nil {
		add(r.PreHookFailure.FailureScreenshot)
	}
	if r.PostHookFailure != nil {
		add(r.PostHookFailure.FailureScreenshot)
	}
	for i := range r.Specs {
		spec := &r.Specs[i]
		add(spec.PreHookScreenshots...)
		add(spec.PostHookScreenshots...)
		for _, f := range spec.PreHookFailures {
			add(f.FailureScreenshot)
		}
		for _, f := range spec.PostHookFailures {
			add(f.FailureScreenshot)
		}
		for j := range spec.Scenarios {
			collectScenarioScreenshots(&spec.Scenarios[j], add)
		}
	}
	return files
}

func collectScenarioScreenshots(scn *ScenarioReport, add func(...string)) {
	add(scn.PreHookScreenshots...)
	add(scn.PostHookScreenshots...)
	if scn.PreHookFailure != nil {
		add(scn.PreHookFailure.FailureScreenshot)
	}
	if scn.PostHookFailure != nil {
		add(scn.PostHookFailure.FailureScreenshot)
	}
	var walk func([]ItemReport)
	walk = func(items []ItemReport) {
		for i := range items {
			item := &items[i]
			if item.Step != nil {
				collectStepScreenshots(item.Step, add)
			}
			if item.Concept != nil {
				if item.Concept.Step != nil {
					collectStepScreenshots(item.Concept.Step, add)
				}
				walk(item.Concept.Items)
			}
		}
	}
	walk(scn.Contexts)
	walk(scn.Items)
	walk(scn.Teardowns)
}

func collectStepScreenshots(step *StepReport, add func(...string)) {
	add(step.Screenshots...)
	add(step.FailureScreenshot)
	add(step.PreHookScreenshots...)
	add(step.PostHookScreenshots...)
	if step.PreHookFailure != nil {
		add(step.PreHookFailure.FailureScreenshot)
	}
	if step.PostHookFailure != nil {
		add(step.PostHookFailure.FailureScreenshot)
	}
}

func copyScreenshots(files []string, destDir string) map[string]string {
	mapping := make(map[string]string, len(files))
	used := map[string]int{}
	for _, src := range files {
		info, err := os.Stat(src)
		if err != nil || info.IsDir() {
			continue
		}
		name := filepath.Base(src)
		if n := used[name]; n > 0 {
			ext := filepath.Ext(name)
			name = fmt.Sprintf("%s-%d%s", strings.TrimSuffix(name, ext), n, ext)
		}
		used[filepath.Base(src)]++
		dest := filepath.Join(destDir, name)
		if err := copyFile(src, dest); err != nil {
			log.Printf("studio-reporter: skip screenshot %s: %v", src, err)
			continue
		}
		mapping[src] = filepath.ToSlash(filepath.Join("images", name))
	}
	return mapping
}

func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

func rewriteScreenshotPaths(r *Report, mapping map[string]string) {
	if len(mapping) == 0 {
		return
	}
	mapList := func(list []string) []string {
		out := make([]string, len(list))
		for i, p := range list {
			if n, ok := mapping[p]; ok {
				out[i] = n
			} else {
				out[i] = p
			}
		}
		return out
	}
	mapHook := func(h *HookFailure) {
		if h != nil {
			if n, ok := mapping[h.FailureScreenshot]; ok {
				h.FailureScreenshot = n
			}
		}
	}
	r.PreHookScreenshots = mapList(r.PreHookScreenshots)
	r.PostHookScreenshots = mapList(r.PostHookScreenshots)
	mapHook(r.PreHookFailure)
	mapHook(r.PostHookFailure)
	for i := range r.Specs {
		spec := &r.Specs[i]
		spec.PreHookScreenshots = mapList(spec.PreHookScreenshots)
		spec.PostHookScreenshots = mapList(spec.PostHookScreenshots)
		for _, f := range spec.PreHookFailures {
			mapHook(f)
		}
		for _, f := range spec.PostHookFailures {
			mapHook(f)
		}
		for j := range spec.Scenarios {
			rewriteScenarioScreenshots(&spec.Scenarios[j], mapList, mapHook)
		}
	}
}

func rewriteScenarioScreenshots(scn *ScenarioReport, mapList func([]string) []string, mapHook func(*HookFailure)) {
	scn.PreHookScreenshots = mapList(scn.PreHookScreenshots)
	scn.PostHookScreenshots = mapList(scn.PostHookScreenshots)
	mapHook(scn.PreHookFailure)
	mapHook(scn.PostHookFailure)
	var walk func([]ItemReport)
	walk = func(items []ItemReport) {
		for i := range items {
			item := &items[i]
			if item.Step != nil {
				rewriteStepScreenshots(item.Step, mapList, mapHook)
			}
			if item.Concept != nil {
				if item.Concept.Step != nil {
					rewriteStepScreenshots(item.Concept.Step, mapList, mapHook)
				}
				walk(item.Concept.Items)
			}
		}
	}
	walk(scn.Contexts)
	walk(scn.Items)
	walk(scn.Teardowns)
}

func rewriteStepScreenshots(step *StepReport, mapList func([]string) []string, mapHook func(*HookFailure)) {
	step.Screenshots = mapList(step.Screenshots)
	step.PreHookScreenshots = mapList(step.PreHookScreenshots)
	step.PostHookScreenshots = mapList(step.PostHookScreenshots)
	mapHook(step.PreHookFailure)
	mapHook(step.PostHookFailure)
	if mapped := mapList([]string{step.FailureScreenshot}); len(mapped) == 1 {
		step.FailureScreenshot = mapped[0]
	}
}

func renderReportHTML(report *Report) ([]byte, error) {
	return renderSnapshotHTML(&LiveSnapshot{Rev: time.Now().UnixMilli(), Running: false, Report: report})
}

func renderSnapshotHTML(snap *LiveSnapshot) ([]byte, error) {
	if snap == nil {
		snap = &LiveSnapshot{}
	}
	if snap.Report == nil {
		snap.Report = &Report{ProjectName: "Gauge Suite", Duration: formatDuration(0), Verdict: verdictNone}
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(true)
	if err := enc.Encode(snap); err != nil {
		return nil, fmt.Errorf("encode report json: %w", err)
	}
	jsonData := strings.TrimSpace(buf.String())
	html := strings.Replace(reportHTMLTemplate, "{{REPORT_JSON}}", jsonData, 1)
	return []byte(html), nil
}
