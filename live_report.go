package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
)

// LiveSnapshot is the JSON envelope the Vue/Pinia viewer polls.
// FormatVersion is bumped on breaking changes; see REPORT_FORMAT.md.
type LiveSnapshot struct {
	FormatVersion     int     `json:"formatVersion"`
	Rev               int64   `json:"rev"`
	Running           bool    `json:"running"`
	Report            *Report `json:"report"`
	CurrentSpecID     string  `json:"currentSpecId,omitempty"`
	CurrentScenarioID string  `json:"currentScenarioId,omitempty"`
	StartedAt         int64   `json:"startedAt,omitempty"`
}

type livePublisher struct {
	mu            sync.Mutex
	dir           string
	report        *Report
	rev           int64
	running       bool
	htmlWritten   bool
	currentSpecID string
	currentScnID  string
	startedAt     int64
}

func newLivePublisher() *livePublisher {
	return &livePublisher{}
}

func writeLiveSnapshot(dir string, snap *LiveSnapshot) error {
	if snap == nil || snap.Report == nil {
		return fmt.Errorf("live snapshot is empty")
	}
	if snap.FormatVersion == 0 {
		snap.FormatVersion = reportFormatVersion
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(true)
	if err := enc.Encode(snap); err != nil {
		return fmt.Errorf("encode live snapshot: %w", err)
	}
	data := bytes.TrimSpace(buf.Bytes())
	jsonPath := filepath.Join(dir, liveReportJSONFile)
	if err := atomicWriteFile(jsonPath, data); err != nil {
		return fmt.Errorf("write %s: %w", liveReportJSONFile, err)
	}
	js := append([]byte("window.__GAUGE_LIVE__="), data...)
	js = append(js, ';')
	if err := atomicWriteFile(filepath.Join(dir, liveReportJSFile), js); err != nil {
		return fmt.Errorf("write %s: %w", liveReportJSFile, err)
	}
	return nil
}

func atomicWriteFile(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		_ = os.Remove(path)
		if err2 := os.Rename(tmpName, path); err2 != nil {
			os.Remove(tmpName)
			return err
		}
	}
	return nil
}

func (p *livePublisher) onExecutionStarting(info *gauge_messages.ExecutionInfo, suite *gauge_messages.ProtoSuiteResult) {
	if shouldSkipReport() {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	name := "Gauge Suite"
	if info != nil && info.GetProjectName() != "" {
		name = info.GetProjectName()
	}
	if suite != nil {
		p.report = toReport(suite)
		if p.report.ProjectName == "Gauge Suite" && name != "" {
			p.report.ProjectName = name
		}
	} else {
		p.report = &Report{
			ProjectName: name,
			Timestamp:   time.Now().Format("2006-01-02 15:04:05"),
			Duration:    formatDuration(0),
			Verdict:     verdictNone,
		}
	}
	p.running = true
	p.startedAt = time.Now().UnixMilli()
	p.htmlWritten = false
	p.currentSpecID = ""
	p.currentScnID = ""
	if err := p.ensureDirLocked(); err != nil {
		logLive("init report dir: %v", err)
		return
	}
	p.publishLocked(false)
}

func (p *livePublisher) onSpecStarting(info *gauge_messages.ExecutionInfo) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.readyLocked() || info == nil || info.GetCurrentSpec() == nil {
		return
	}
	specInfo := info.GetCurrentSpec()
	id := specStableID(specInfo.GetFileName(), len(p.report.Specs))
	p.currentSpecID = id
	p.currentScnID = ""
	if idx := p.specIndex(id); idx >= 0 {
		spec := &p.report.Specs[idx]
		if specInfo.GetIsFailed() {
			spec.Verdict = verdictFail
		}
	} else {
		heading := specInfo.GetName()
		if heading == "" {
			heading = filepath.Base(specInfo.GetFileName())
		}
		p.report.Specs = append(p.report.Specs, SpecReport{
			ID:       id,
			Heading:  heading,
			FileName: specInfo.GetFileName(),
			Folders:  specFolders(specInfo.GetFileName()),
			Tags:     specInfo.GetTags(),
			Duration: formatDuration(0),
			Verdict:  verdictNone,
		})
	}
	p.publishLocked(false)
}

func (p *livePublisher) onSpecEnding(req *gauge_messages.SpecExecutionEndingRequest) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.readyLocked() || req == nil {
		return
	}
	if res := req.GetSpecResult(); res != nil && res.GetProtoSpec() != nil {
		id := specStableID(res.GetProtoSpec().GetFileName(), len(p.report.Specs))
		spec := toSpecReport(id, res)
		liveSpecScenarioOnly(&spec)
		if idx := p.specIndex(id); idx >= 0 {
			p.report.Specs[idx] = spec
		} else {
			p.report.Specs = append(p.report.Specs, spec)
		}
		p.currentSpecID = id
	} else if info := req.GetCurrentExecutionInfo(); info != nil && info.GetCurrentSpec() != nil {
		id := specStableID(info.GetCurrentSpec().GetFileName(), len(p.report.Specs))
		if idx := p.specIndex(id); idx >= 0 && info.GetCurrentSpec().GetIsFailed() {
			p.report.Specs[idx].Verdict = verdictFail
		}
	}
	p.publishLocked(true)
}

func (p *livePublisher) onScenarioStarting(info *gauge_messages.ExecutionInfo) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.readyLocked() || info == nil || info.GetCurrentSpec() == nil || info.GetCurrentScenario() == nil {
		return
	}
	specID := specStableID(info.GetCurrentSpec().GetFileName(), len(p.report.Specs))
	p.currentSpecID = specID
	idx := p.ensureSpecFromInfo(info.GetCurrentSpec())
	if idx < 0 {
		return
	}
	heading := info.GetCurrentScenario().GetName()
	if id := p.inProgressScenarioID(idx, heading); id != "" {
		p.currentScnID = id
		p.publishLocked(false)
		return
	}
	id := fmt.Sprintf("%s-scn-%d", specID, len(p.report.Specs[idx].Scenarios))
	verdict := verdictNone
	if info.GetCurrentScenario().GetIsFailed() {
		verdict = verdictFail
	}
	p.report.Specs[idx].Scenarios = append(p.report.Specs[idx].Scenarios, ScenarioReport{
		ID:            id,
		Heading:       heading,
		Tags:          info.GetCurrentScenario().GetTags(),
		Duration:      formatDuration(0),
		Verdict:       verdict,
		TableRowIndex: -1,
	})
	p.currentScnID = id
	p.publishLocked(false)
}

func (p *livePublisher) onScenarioEnding(req *gauge_messages.ScenarioExecutionEndingRequest) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if !p.readyLocked() || req == nil {
		return
	}
	info := req.GetCurrentExecutionInfo()
	if info != nil && info.GetCurrentSpec() != nil {
		p.currentSpecID = specStableID(info.GetCurrentSpec().GetFileName(), len(p.report.Specs))
		p.ensureSpecFromInfo(info.GetCurrentSpec())
	}
	if res := req.GetScenarioResult(); res != nil && res.GetProtoItem() != nil {
		specIdx := p.specIndex(p.currentSpecID)
		if specIdx < 0 {
			p.publishLocked(true)
			return
		}
		item := res.GetProtoItem()
		scnIndex := p.scenarioIndexForResult(specIdx, item)
		if scnIndex < 0 {
			scnIndex = len(p.report.Specs[specIdx].Scenarios)
		}
		id := fmt.Sprintf("%s-scn-%d", p.currentSpecID, scnIndex)
		if scnIndex < len(p.report.Specs[specIdx].Scenarios) {
			id = p.report.Specs[specIdx].Scenarios[scnIndex].ID
		}
		if converted := scenarioFromProtoItem(id, item); converted != nil {
			converted.ID = id
			liveScenarioOnly(converted)
			if scnIndex < len(p.report.Specs[specIdx].Scenarios) {
				p.report.Specs[specIdx].Scenarios[scnIndex] = *converted
			} else {
				p.report.Specs[specIdx].Scenarios = append(p.report.Specs[specIdx].Scenarios, *converted)
			}
			p.currentScnID = converted.ID
		}
	}
	p.publishLocked(true)
}

// Live snapshots only track Spec → Scenario. Step / Concept detail is omitted until
// SuiteResult writes the final report (see onSuiteResult → toReport).
func (p *livePublisher) onStepStarting(info *gauge_messages.ExecutionInfo) {
	_ = info
}

func (p *livePublisher) onConceptStarting(info *gauge_messages.ExecutionInfo) {
	_ = info
}

func (p *livePublisher) onStepOrConceptEnding(res *gauge_messages.ProtoStepResult, info *gauge_messages.ExecutionInfo) {
	_, _ = res, info
}

// liveScenarioOnly keeps scenario metadata for live report.json and drops step trees.
func liveScenarioOnly(scn *ScenarioReport) {
	if scn == nil {
		return
	}
	scn.Contexts = nil
	scn.Items = nil
	scn.Teardowns = nil
}

func liveSpecScenarioOnly(spec *SpecReport) {
	if spec == nil {
		return
	}
	for i := range spec.Scenarios {
		liveScenarioOnly(&spec.Scenarios[i])
	}
}

func (p *livePublisher) onSuiteResult(suite *gauge_messages.ProtoSuiteResult) {
	if shouldSkipReport() {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if suite != nil {
		p.report = toReport(suite)
	}
	p.running = false
	if err := p.ensureDirLocked(); err != nil {
		logLive("finalize report dir: %v", err)
		return
	}
	p.publishLocked(true)
}

func (p *livePublisher) readyLocked() bool {
	if shouldSkipReport() {
		return false
	}
	if p.report == nil {
		p.report = &Report{ProjectName: "Gauge Suite", Duration: formatDuration(0), Verdict: verdictNone, Timestamp: time.Now().Format("2006-01-02 15:04:05")}
	}
	if p.dir == "" {
		if err := p.ensureDirLocked(); err != nil {
			logLive("ensure report dir: %v", err)
			return false
		}
	}
	return true
}

func (p *livePublisher) ensureDirLocked() error {
	if p.dir != "" {
		return nil
	}
	dir, err := resolveReportDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(dir, "images"), 0o755); err != nil {
		return err
	}
	if err := writeReportAssets(dir); err != nil {
		return err
	}
	p.dir = dir
	return nil
}

func reportDirFromLive(p *livePublisher) string {
	if p == nil {
		return ""
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.dir
}

func (p *livePublisher) publishLocked(writeHTML bool) {
	if p.dir == "" || p.report == nil {
		return
	}
	recountReport(p.report)
	if p.running && p.startedAt > 0 {
		elapsed := time.Now().UnixMilli() - p.startedAt
		if elapsed < 0 {
			elapsed = 0
		}
		p.report.ExecutionTime = elapsed
		p.report.Duration = formatDuration(elapsed)
	}
	next := time.Now().UnixMilli()
	if next <= p.rev {
		next = p.rev + 1
	}
	p.rev = next
	snap := &LiveSnapshot{
		Rev:               p.rev,
		Running:           p.running,
		Report:            p.report,
		CurrentSpecID:     p.currentSpecID,
		CurrentScenarioID: p.currentScnID,
		StartedAt:         p.startedAt,
	}
	if writeHTML || !p.htmlWritten {
		html, err := renderSnapshotHTML(snap)
		if err != nil {
			logLive("render html: %v", err)
		} else if err := atomicWriteFile(filepath.Join(p.dir, reportIndexFile), html); err != nil {
			logLive("write html: %v", err)
		} else {
			p.htmlWritten = true
			openReportPage(filepath.Join(p.dir, reportIndexFile))
		}
	}
	if err := writeLiveSnapshot(p.dir, snap); err != nil {
		logLive("write live snapshot: %v", err)
	}
}

func (p *livePublisher) specIndex(id string) int {
	for i := range p.report.Specs {
		if p.report.Specs[i].ID == id {
			return i
		}
	}
	return -1
}

func (p *livePublisher) ensureSpecFromInfo(info *gauge_messages.SpecInfo) int {
	if info == nil {
		return -1
	}
	id := specStableID(info.GetFileName(), len(p.report.Specs))
	if idx := p.specIndex(id); idx >= 0 {
		return idx
	}
	heading := info.GetName()
	if heading == "" {
		heading = filepath.Base(info.GetFileName())
	}
	p.report.Specs = append(p.report.Specs, SpecReport{
		ID:       id,
		Heading:  heading,
		FileName: info.GetFileName(),
		Folders:  specFolders(info.GetFileName()),
		Tags:     info.GetTags(),
		Duration: formatDuration(0),
		Verdict:  verdictNone,
	})
	return len(p.report.Specs) - 1
}

func (p *livePublisher) inProgressScenarioID(specIdx int, heading string) string {
	if heading == "" || specIdx < 0 {
		return ""
	}
	for i := range p.report.Specs[specIdx].Scenarios {
		scn := p.report.Specs[specIdx].Scenarios[i]
		if scn.Heading == heading && (scn.Verdict == verdictNone || scn.Verdict == "") {
			return scn.ID
		}
	}
	return ""
}

func (p *livePublisher) scenarioIndexForResult(specIdx int, item *gauge_messages.ProtoItem) int {
	heading := scenarioHeadingOf(item)
	specRow, scnRow := tableRowIndexesOf(item)
	if specRow >= 0 {
		for i := range p.report.Specs[specIdx].Scenarios {
			s := p.report.Specs[specIdx].Scenarios[i]
			if s.Heading == heading && s.TableRowIndex == specRow {
				return i
			}
		}
	}
	if scnRow >= 0 {
		for i := range p.report.Specs[specIdx].Scenarios {
			s := p.report.Specs[specIdx].Scenarios[i]
			if s.Heading == heading && s.IsScenarioTableDriven && s.ScenarioTableRowIndex == scnRow {
				return i
			}
		}
	}
	if heading != "" && p.currentScnID != "" {
		for i := range p.report.Specs[specIdx].Scenarios {
			s := p.report.Specs[specIdx].Scenarios[i]
			if s.ID == p.currentScnID && s.Heading == heading && (s.Verdict == verdictNone || s.Verdict == "") {
				return i
			}
		}
	}
	if heading != "" {
		if id := p.inProgressScenarioID(specIdx, heading); id != "" {
			for i := range p.report.Specs[specIdx].Scenarios {
				if p.report.Specs[specIdx].Scenarios[i].ID == id {
					return i
				}
			}
		}
	}
	if heading == "" && p.currentScnID != "" {
		for i := range p.report.Specs[specIdx].Scenarios {
			if p.report.Specs[specIdx].Scenarios[i].ID == p.currentScnID {
				return i
			}
		}
	}
	return -1
}

func tableRowIndexesOf(item *gauge_messages.ProtoItem) (specRow, scnRow int) {
	specRow, scnRow = -1, -1
	if item == nil {
		return
	}
	td := item.GetTableDrivenScenario()
	if td == nil {
		return
	}
	if td.GetIsSpecTableDriven() {
		specRow = int(td.GetTableRowIndex())
	}
	if td.GetIsScenarioTableDriven() {
		scnRow = int(td.GetScenarioTableRowIndex())
	}
	return
}

func (p *livePublisher) scenarioIndexByHeading(specIdx int, heading string) int {
	if heading == "" {
		return -1
	}
	for i := range p.report.Specs[specIdx].Scenarios {
		if p.report.Specs[specIdx].Scenarios[i].Heading == heading {
			return i
		}
	}
	return -1
}

func scenarioHeadingOf(item *gauge_messages.ProtoItem) string {
	if item == nil {
		return ""
	}
	if item.GetScenario() != nil {
		return item.GetScenario().GetScenarioHeading()
	}
	if td := item.GetTableDrivenScenario(); td != nil && td.GetScenario() != nil {
		return td.GetScenario().GetScenarioHeading()
	}
	return ""
}

func scenarioFromProtoItem(id string, item *gauge_messages.ProtoItem) *ScenarioReport {
	if item == nil {
		return nil
	}
	switch item.GetItemType() {
	case gauge_messages.ProtoItem_Scenario:
		scn := toScenarioReport(id, item.GetScenario(), -1, nil)
		return &scn
	case gauge_messages.ProtoItem_TableDrivenScenario:
		td := item.GetTableDrivenScenario()
		rowIndex := -1
		if td.GetIsSpecTableDriven() {
			rowIndex = int(td.GetTableRowIndex())
		}
		scn := toScenarioReport(id, td.GetScenario(), rowIndex, td)
		return &scn
	default:
		return nil
	}
}

func logLive(format string, args ...interface{}) {
	log.Printf("studio-reporter: "+format, args...)
}
