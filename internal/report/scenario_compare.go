package report

import (
	"fmt"
	"sort"
	"strings"
)

// ScenarioLite is a compact scenario row used for pairwise run diffs.
type ScenarioLite struct {
	Key                   string `json:"key"`
	SpecID                string `json:"specId"`
	SpecName              string `json:"specName"`
	SpecFile              string `json:"specFile"`
	ScnID                 string `json:"scnId"`
	ScnName               string `json:"scnName"`
	Verdict               string `json:"verdict"`
	FailReason            string `json:"failReason,omitempty"`
	TableRowIndex         int    `json:"tableRowIndex"`
	ScenarioTableRowIndex int    `json:"scenarioTableRowIndex"`
}

// ScenarioDiffKind classifies a pairwise scenario change.
type ScenarioDiffKind string

const (
	ScenarioDiffAdded          ScenarioDiffKind = "added"
	ScenarioDiffRemoved        ScenarioDiffKind = "removed"
	ScenarioDiffRegressed      ScenarioDiffKind = "regressed" // non-fail → fail
	ScenarioDiffFixed          ScenarioDiffKind = "fixed"     // fail → non-fail
	ScenarioDiffVerdictChanged ScenarioDiffKind = "verdict_changed"
	ScenarioDiffReasonChanged  ScenarioDiffKind = "reason_changed"
)

// ScenarioDiff is one matched/unmatched scenario change (target vs base).
type ScenarioDiff struct {
	Key          string           `json:"key"`
	SpecName     string           `json:"specName"`
	ScnName      string           `json:"scnName"`
	Kind         ScenarioDiffKind `json:"kind"`
	BaseVerdict  string           `json:"baseVerdict,omitempty"`
	TargetVerdict string          `json:"targetVerdict,omitempty"`
	BaseReason   string           `json:"baseReason,omitempty"`
	TargetReason string           `json:"targetReason,omitempty"`
}

// ScenarioCompare is the scenario-level diff between two reports.
type ScenarioCompare struct {
	Changed         []ScenarioDiff `json:"changed"`
	UnchangedCount  int            `json:"unchangedCount"`
	BaseCount       int            `json:"baseCount"`
	TargetCount     int            `json:"targetCount"`
}

// ScenarioKey builds a stable match key across runs (prefers file+heading+row indexes).
func ScenarioKey(spec SpecReport, scn ScenarioReport) string {
	file := strings.TrimSpace(spec.FileName)
	if file == "" {
		file = strings.TrimSpace(spec.ID)
	}
	name := strings.TrimSpace(scn.Heading)
	if name == "" {
		name = strings.TrimSpace(scn.ID)
	}
	return fmt.Sprintf("%s\x00%s\x00%d\x00%d", file, name, scn.TableRowIndex, scn.ScenarioTableRowIndex)
}

// ScenarioLitesFromReport flattens specs→scenarios into comparable rows.
func ScenarioLitesFromReport(r *Report) []ScenarioLite {
	if r == nil {
		return nil
	}
	out := make([]ScenarioLite, 0, 64)
	for i := range r.Specs {
		sp := r.Specs[i]
		specName := strings.TrimSpace(sp.Heading)
		if specName == "" {
			specName = strings.TrimSpace(sp.FileName)
		}
		if specName == "" {
			specName = sp.ID
		}
		for j := range sp.Scenarios {
			scn := sp.Scenarios[j]
			scnName := strings.TrimSpace(scn.Heading)
			if scnName == "" {
				scnName = scn.ID
			}
			lite := ScenarioLite{
				Key:                   ScenarioKey(sp, scn),
				SpecID:                sp.ID,
				SpecName:              specName,
				SpecFile:              sp.FileName,
				ScnID:                 scn.ID,
				ScnName:               scnName,
				Verdict:               scn.Verdict,
				TableRowIndex:         scn.TableRowIndex,
				ScenarioTableRowIndex: scn.ScenarioTableRowIndex,
			}
			if scn.Verdict == VerdictFail {
				lite.FailReason = scenarioPrimaryFailReason(scn)
			}
			out = append(out, lite)
		}
	}
	return out
}

func isFail(v string) bool {
	return v == VerdictFail
}

func classifyScenarioDiff(base, target *ScenarioLite) ScenarioDiffKind {
	if base == nil && target != nil {
		return ScenarioDiffAdded
	}
	if base != nil && target == nil {
		return ScenarioDiffRemoved
	}
	if base == nil || target == nil {
		return ScenarioDiffVerdictChanged
	}
	if base.Verdict == target.Verdict {
		if isFail(base.Verdict) && base.FailReason != target.FailReason {
			return ScenarioDiffReasonChanged
		}
		return ""
	}
	if !isFail(base.Verdict) && isFail(target.Verdict) {
		return ScenarioDiffRegressed
	}
	if isFail(base.Verdict) && !isFail(target.Verdict) {
		return ScenarioDiffFixed
	}
	return ScenarioDiffVerdictChanged
}

// CompareScenarios diffs two scenario lite lists (target − base semantics for kinds).
func CompareScenarios(base, target []ScenarioLite) ScenarioCompare {
	baseMap := map[string]ScenarioLite{}
	targetMap := map[string]ScenarioLite{}
	keys := map[string]struct{}{}
	for _, s := range base {
		baseMap[s.Key] = s
		keys[s.Key] = struct{}{}
	}
	for _, s := range target {
		targetMap[s.Key] = s
		keys[s.Key] = struct{}{}
	}

	changed := make([]ScenarioDiff, 0)
	unchanged := 0
	for key := range keys {
		b, bok := baseMap[key]
		t, tok := targetMap[key]
		var bp, tp *ScenarioLite
		if bok {
			bp = &b
		}
		if tok {
			tp = &t
		}
		kind := classifyScenarioDiff(bp, tp)
		if kind == "" {
			unchanged++
			continue
		}
		d := ScenarioDiff{Key: key, Kind: kind}
		if bp != nil {
			d.SpecName = bp.SpecName
			d.ScnName = bp.ScnName
			d.BaseVerdict = bp.Verdict
			d.BaseReason = bp.FailReason
		}
		if tp != nil {
			if d.SpecName == "" {
				d.SpecName = tp.SpecName
			}
			if d.ScnName == "" {
				d.ScnName = tp.ScnName
			}
			d.TargetVerdict = tp.Verdict
			d.TargetReason = tp.FailReason
		}
		changed = append(changed, d)
	}

	sort.SliceStable(changed, func(i, j int) bool {
		oi := scenarioDiffOrder(changed[i].Kind)
		oj := scenarioDiffOrder(changed[j].Kind)
		if oi != oj {
			return oi < oj
		}
		if changed[i].SpecName != changed[j].SpecName {
			return changed[i].SpecName < changed[j].SpecName
		}
		return changed[i].ScnName < changed[j].ScnName
	})

	return ScenarioCompare{
		Changed:        changed,
		UnchangedCount: unchanged,
		BaseCount:      len(base),
		TargetCount:    len(target),
	}
}

func scenarioDiffOrder(k ScenarioDiffKind) int {
	switch k {
	case ScenarioDiffRegressed:
		return 0
	case ScenarioDiffReasonChanged:
		return 1
	case ScenarioDiffVerdictChanged:
		return 2
	case ScenarioDiffAdded:
		return 3
	case ScenarioDiffRemoved:
		return 4
	case ScenarioDiffFixed:
		return 5
	default:
		return 9
	}
}

// InvertScenarioCompare swaps base/target sides and remaps change kinds.
func InvertScenarioCompare(cmp ScenarioCompare) ScenarioCompare {
	out := ScenarioCompare{
		UnchangedCount: cmp.UnchangedCount,
		BaseCount:      cmp.TargetCount,
		TargetCount:    cmp.BaseCount,
		Changed:        make([]ScenarioDiff, 0, len(cmp.Changed)),
	}
	for _, d := range cmp.Changed {
		nd := ScenarioDiff{
			Key:           d.Key,
			SpecName:      d.SpecName,
			ScnName:       d.ScnName,
			BaseVerdict:   d.TargetVerdict,
			TargetVerdict: d.BaseVerdict,
			BaseReason:    d.TargetReason,
			TargetReason:  d.BaseReason,
		}
		switch d.Kind {
		case ScenarioDiffAdded:
			nd.Kind = ScenarioDiffRemoved
		case ScenarioDiffRemoved:
			nd.Kind = ScenarioDiffAdded
		case ScenarioDiffRegressed:
			nd.Kind = ScenarioDiffFixed
		case ScenarioDiffFixed:
			nd.Kind = ScenarioDiffRegressed
		default:
			nd.Kind = d.Kind
		}
		out.Changed = append(out.Changed, nd)
	}
	sort.SliceStable(out.Changed, func(i, j int) bool {
		oi := scenarioDiffOrder(out.Changed[i].Kind)
		oj := scenarioDiffOrder(out.Changed[j].Kind)
		if oi != oj {
			return oi < oj
		}
		if out.Changed[i].SpecName != out.Changed[j].SpecName {
			return out.Changed[i].SpecName < out.Changed[j].SpecName
		}
		return out.Changed[i].ScnName < out.Changed[j].ScnName
	})
	return out
}
