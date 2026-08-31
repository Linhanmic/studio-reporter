package report

import (
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
)

// LivePublisher keeps the report tree in memory during a run and broadcasts updates.
// Nothing is written to disk until FinalWriter runs on suite completion.
type LivePublisher struct {
	mu            sync.Mutex
	dir           string
	report        *Report
	rev           int64
	running       bool
	currentSpecID string
	currentScnID  string
	startedAt     int64
	broadcast     SnapshotBroadcaster
}

// NewLivePublisher creates a live publisher.
func NewLivePublisher(broadcast SnapshotBroadcaster) *LivePublisher {
	return &LivePublisher{broadcast: broadcast}
}

// Dir returns the report hub directory (empty until the first publish).
func (p *LivePublisher) Dir() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.dir
}

func (p *LivePublisher) OnExecutionStarting(info *gauge_messages.ExecutionInfo, suite *gauge_messages.ProtoSuiteResult) {
	if ShouldSkipReport() {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	name := "Gauge Suite"
	if info != nil && info.GetProjectName() != "" {
		name = info.GetProjectName()
	}
	if suite != nil {
		p.report = FromSuite(suite)
		if p.report.ProjectName == "Gauge Suite" && name != "" {
			p.report.ProjectName = name
		}
	} else {
		p.report = &Report{
			ProjectName: name,
			Timestamp:   time.Now().Format("2006-01-02 15:04:05"),
			Duration:    formatDuration(0),
			Verdict:     VerdictNone,
		}
	}
	p.running = true
	p.startedAt = time.Now().UnixMilli()
	p.currentSpecID = ""
	p.currentScnID = ""
	p.publishLocked()
}

func (p *LivePublisher) OnSpecStarting(info *gauge_messages.ExecutionInfo) {
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
			spec.Verdict = VerdictFail
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
			Verdict:  VerdictNone,
		})
	}
	p.publishLocked()
}

func (p *LivePublisher) OnSpecEnding(req *gauge_messages.SpecExecutionEndingRequest) {
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
			p.report.Specs[idx].Verdict = VerdictFail
		}
	}
	p.publishLocked()
}

func (p *LivePublisher) OnScenarioStarting(info *gauge_messages.ExecutionInfo) {
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
		p.publishLocked()
		return
	}
	id := fmt.Sprintf("%s-scn-%d", specID, len(p.report.Specs[idx].Scenarios))
	verdict := VerdictNone
	if info.GetCurrentScenario().GetIsFailed() {
		verdict = VerdictFail
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
	p.publishLocked()
}

func (p *LivePublisher) OnScenarioEnding(req *gauge_messages.ScenarioExecutionEndingRequest) {
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
			p.publishLocked()
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
	p.publishLocked()
}

// Live snapshots only track Spec → Scenario. Step detail appears in the final report.
func (p *LivePublisher) OnStepStarting(_ *gauge_messages.ExecutionInfo) {}

func (p *LivePublisher) OnConceptStarting(_ *gauge_messages.ExecutionInfo) {}

func (p *LivePublisher) OnStepOrConceptEnding(_ *gauge_messages.ProtoStepResult, _ *gauge_messages.ExecutionInfo) {}

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

// FinishWithReport marks the suite complete and publishes the final pre-built report.
func (p *LivePublisher) FinishWithReport(r *Report) {
	if ShouldSkipReport() {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if r != nil {
		p.report = r
	}
	p.running = false
	p.publishLocked()
}

// Snapshot returns the latest in-memory tree (for tests).
func (p *LivePublisher) Snapshot() *LiveSnapshot {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.report == nil {
		return nil
	}
	return &LiveSnapshot{
		FormatVersion:     FormatVersion,
		Rev:               p.rev,
		Running:           p.running,
		Report:            p.report,
		CurrentSpecID:     p.currentSpecID,
		CurrentScenarioID: p.currentScnID,
		StartedAt:         p.startedAt,
	}
}

func (p *LivePublisher) readyLocked() bool {
	if ShouldSkipReport() {
		return false
	}
	if p.report == nil {
		p.report = &Report{ProjectName: "Gauge Suite", Duration: formatDuration(0), Verdict: VerdictNone, Timestamp: time.Now().Format("2006-01-02 15:04:05")}
	}
	return true
}

// SetDir records the hub directory after a final write (tests / reuse checks).
func (p *LivePublisher) SetDir(dir string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.dir = dir
}

func (p *LivePublisher) publishLocked() {
	if p.report == nil {
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
		FormatVersion:     FormatVersion,
		Rev:               p.rev,
		Running:           p.running,
		Report:            p.report,
		CurrentSpecID:     p.currentSpecID,
		CurrentScenarioID: p.currentScnID,
		StartedAt:         p.startedAt,
	}
	if p.broadcast != nil {
		p.broadcast(snap)
	}
}

func (p *LivePublisher) specIndex(id string) int {
	for i := range p.report.Specs {
		if p.report.Specs[i].ID == id {
			return i
		}
	}
	return -1
}

func (p *LivePublisher) ensureSpecFromInfo(info *gauge_messages.SpecInfo) int {
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
		Verdict:  VerdictNone,
	})
	return len(p.report.Specs) - 1
}

func (p *LivePublisher) inProgressScenarioID(specIdx int, heading string) string {
	if heading == "" || specIdx < 0 {
		return ""
	}
	for i := range p.report.Specs[specIdx].Scenarios {
		scn := p.report.Specs[specIdx].Scenarios[i]
		if scn.Heading == heading && (scn.Verdict == VerdictNone || scn.Verdict == "") {
			return scn.ID
		}
	}
	return ""
}

func (p *LivePublisher) scenarioIndexForResult(specIdx int, item *gauge_messages.ProtoItem) int {
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
			if s.ID == p.currentScnID && s.Heading == heading && (s.Verdict == VerdictNone || s.Verdict == "") {
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