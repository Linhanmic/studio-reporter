package report

import (
	"net/url"
	"strings"
)

// ShareHash is the static report URL fragment contract mirrored by static_report.js.
// Format: #<focus>[?q=&spec=&scenario=&failSteps=1]
// Legacy: #fail-steps (implies overview + failSteps).
type ShareHash struct {
	Focus     string
	Query     string
	Spec      string
	Scenario  string
	FailSteps bool
}

func normalizeShareVerdict(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "pass", "fail", "skip":
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return "all"
	}
}

// ParseShareHash parses a location.hash (with or without leading #).
func ParseShareHash(raw string) ShareHash {
	out := ShareHash{Focus: "overview", Spec: "all", Scenario: "all"}
	input := strings.TrimPrefix(strings.TrimSpace(raw), "#")
	if input == "" {
		return out
	}
	head, qs, hasQS := strings.Cut(input, "?")
	failSteps := false
	focus := head
	if head == "fail-steps" || strings.HasPrefix(head, "fail-steps&") || strings.HasPrefix(head, "fail-steps/") {
		focus = "overview"
		failSteps = true
		if strings.HasPrefix(head, "fail-steps&") {
			extra := strings.TrimPrefix(head, "fail-steps&")
			if hasQS {
				qs = extra + "&" + qs
			} else {
				qs = extra
				hasQS = true
			}
		}
	}
	if focus == "" {
		focus = "overview"
	}
	out.Focus = focus
	out.FailSteps = failSteps
	if hasQS && qs != "" {
		params, err := url.ParseQuery(qs)
		if err == nil {
			if params.Has("q") {
				out.Query = params.Get("q")
			}
			if params.Has("query") {
				out.Query = params.Get("query")
			}
			if sp := params.Get("spec"); sp != "" {
				out.Spec = normalizeShareVerdict(sp)
			}
			if sc := params.Get("scenario"); sc != "" {
				out.Scenario = normalizeShareVerdict(sc)
			} else if sc := params.Get("scn"); sc != "" {
				out.Scenario = normalizeShareVerdict(sc)
			}
			fs := params.Get("failSteps")
			if fs == "" {
				fs = params.Get("fail-steps")
			}
			switch strings.ToLower(fs) {
			case "1", "true", "yes":
				out.FailSteps = true
			case "0", "false", "no":
				out.FailSteps = false
			}
		}
	}
	out.Spec = normalizeShareVerdict(out.Spec)
	out.Scenario = normalizeShareVerdict(out.Scenario)
	return out
}

// FormatShareHash builds a fragment without leading #.
func FormatShareHash(h ShareHash) string {
	focus := strings.TrimSpace(h.Focus)
	if focus == "" || focus == "overview" {
		focus = "overview"
	}
	params := url.Values{}
	q := strings.TrimSpace(h.Query)
	if q != "" {
		params.Set("q", q)
	}
	if sp := normalizeShareVerdict(h.Spec); sp != "all" {
		params.Set("spec", sp)
	}
	if sc := normalizeShareVerdict(h.Scenario); sc != "all" {
		params.Set("scenario", sc)
	}
	if h.FailSteps {
		params.Set("failSteps", "1")
	}
	enc := params.Encode()
	if enc == "" {
		return focus
	}
	return focus + "?" + enc
}
