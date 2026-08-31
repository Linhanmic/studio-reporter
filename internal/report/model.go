package report

// Report model types consumed by the HTML viewer. See REPORT_FORMAT.md.

const (
	VerdictPass              = "pass"
	VerdictFail              = "fail"
	VerdictSkip              = "skip"
	VerdictNone              = "none"
	ReportsDirEnv            = "gauge_reports_dir"
	OverwriteReportsEnv      = "overwrite_reports"
	OverwriteReportsEnvAlias = "over_write_reports"
	GaugeProjectRootEnv      = "GAUGE_PROJECT_ROOT"
	SkipReportEnv            = "GAUGE_STUDIO_SKIP_REPORT"
	DefaultReportsDir        = "reports"
	FolderName               = "studio-report"
	IndexFile                = "index.html"
	ViewerFile               = "viewer.html"
	ManageIndexFile          = "manage.html"
	FormatVersion            = 1
	UhilReportExt            = ".uhilreport"
	LiveReportJSONFile       = "report.json"
	LiveReportJSFile         = "report-live.js"
	TimeLayout               = "2006-01-02_15.04.05"
)

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

// LiveSnapshot is the JSON envelope the viewer polls while a suite runs.
type LiveSnapshot struct {
	FormatVersion     int     `json:"formatVersion"`
	Rev               int64   `json:"rev"`
	Running           bool    `json:"running"`
	Report            *Report `json:"report"`
	CurrentSpecID     string  `json:"currentSpecId,omitempty"`
	CurrentScenarioID string  `json:"currentScenarioId,omitempty"`
	StartedAt         int64   `json:"startedAt,omitempty"`
}

// GeneratedReport paths returned after a final write.
type GeneratedReport struct {
	Dir       string
	IndexPath string
	JSONPath  string
}

// HistoryRecorder archives completed runs (implemented by main/history).
type HistoryRecorder interface {
	RecordCompletedRun(runDir string, r *Report) error
}

// IndexHTMLCallback is invoked after index.html is written (e.g. open browser).
type IndexHTMLCallback func(indexPath string)
