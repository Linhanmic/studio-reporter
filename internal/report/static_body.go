package report

import "fmt"

type bodyRow struct {
	kind          string
	id            string
	heading       string
	duration      string
	verdict       string
	headers       []string
	cells         []string
	rowIndex      int
	scenarios     []ScenarioReport
	executionTime int64
}

func specBodyRows(spec SpecReport) []bodyRow {
	scns := spec.Scenarios
	dt := spec.Datatable
	if dt != nil && len(dt.Rows) > 0 {
		used := map[string]bool{}
		var out []bodyRow
		for i, cells := range dt.Rows {
			var matched []ScenarioReport
			for _, s := range scns {
				if s.TableRowIndex == i {
					matched = append(matched, s)
					used[s.ID] = true
				}
			}
			out = append(out, bodyRow{
				kind:          "datarow",
				id:            fmt.Sprintf("%s-row-%d", spec.ID, i),
				heading:       dataRowHeading(dt.Headers, cells, i),
				headers:       dt.Headers,
				cells:         cells,
				rowIndex:      i,
				scenarios:     matched,
				verdict:       foldVerdict(matched),
				duration:      formatDuration(foldDurationMS(matched)),
				executionTime: foldDurationMS(matched),
			})
		}
		for _, s := range scns {
			if !used[s.ID] {
				out = append(out, scenarioBodyRow(s))
			}
		}
		return out
	}
	return groupScenarioTableDriven(scns)
}

func scenarioBodyRow(s ScenarioReport) bodyRow {
	return bodyRow{
		kind:          "scenario",
		id:            s.ID,
		heading:       s.Heading,
		duration:      s.Duration,
		verdict:       s.Verdict,
		scenarios:     []ScenarioReport{s},
		executionTime: s.ExecutionTime,
	}
}

func groupScenarioTableDriven(scns []ScenarioReport) []bodyRow {
	var out []bodyRow
	groups := map[string]*bodyRow{}
	order := []string{}
	for _, s := range scns {
		if s.IsScenarioTableDriven {
			key := s.Heading
			g, ok := groups[key]
			if !ok {
				g = &bodyRow{
					kind:    "datadriven",
					id:      s.ID + "-dd",
					heading: s.Heading,
				}
				groups[key] = g
				order = append(order, key)
			}
			g.scenarios = append(g.scenarios, s)
		} else {
			out = append(out, scenarioBodyRow(s))
		}
	}
	for _, key := range order {
		g := groups[key]
		g.verdict = foldVerdict(g.scenarios)
		g.duration = formatDuration(foldDurationMS(g.scenarios))
		g.executionTime = foldDurationMS(g.scenarios)
		out = append(out, *g)
	}
	return out
}

func dataRowHeading(headers, cells []string, i int) string {
	var pairs []string
	for idx, h := range headers {
		cell := ""
		if idx < len(cells) {
			cell = cells[idx]
		}
		if h != "" || cell != "" {
			pairs = append(pairs, h+"="+cell)
		}
	}
	preview := joinComma(pairs)
	if preview == "" {
		preview = joinComma(cells)
	}
	if preview != "" {
		return fmt.Sprintf("第 %d 行 · %s", i+1, preview)
	}
	return fmt.Sprintf("第 %d 行", i+1)
}

func joinComma(parts []string) string {
	if len(parts) == 0 {
		return ""
	}
	out := parts[0]
	for i := 1; i < len(parts); i++ {
		out += ", " + parts[i]
	}
	return out
}

func foldVerdict(scns []ScenarioReport) string {
	best := VerdictNone
	for _, s := range scns {
		best = worseVerdict(best, s.Verdict)
	}
	return best
}

func worseVerdict(a, b string) string {
	rank := map[string]int{VerdictFail: 3, VerdictSkip: 2, VerdictPass: 1, VerdictNone: 0}
	if rank[a] >= rank[b] {
		if a == "" {
			return b
		}
		return a
	}
	return b
}

func foldDurationMS(scns []ScenarioReport) int64 {
	var n int64
	for _, s := range scns {
		n += s.ExecutionTime
	}
	return n
}

func bodyTypeLabel(row bodyRow) string {
	switch row.kind {
	case "datarow":
		return "数据行"
	case "datadriven":
		return "数据驱动"
	default:
		return "场景"
	}
}

func bodyName(row bodyRow) string {
	if row.kind == "datadriven" {
		return fmt.Sprintf("%s · %d 行", row.heading, len(row.scenarios))
	}
	return row.heading
}

func scenarioPhaseItems(scn ScenarioReport) []struct {
	phase string
	item  ItemReport
} {
	var out []struct {
		phase string
		item  ItemReport
	}
	for _, it := range scn.Contexts {
		out = append(out, struct {
			phase string
			item  ItemReport
		}{"Context", it})
	}
	for _, it := range scn.Items {
		phase := "Step"
		if it.Kind == "concept" {
			phase = "Concept"
		}
		out = append(out, struct {
			phase string
			item  ItemReport
		}{phase, it})
	}
	for _, it := range scn.Teardowns {
		out = append(out, struct {
			phase string
			item  ItemReport
		}{"Teardown", it})
	}
	return out
}
