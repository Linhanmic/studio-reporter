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

// parseFailStepsFlag interprets share/deeplink boolean tokens.
// Accepted truthy: 1/true/yes; falsy: 0/false/no (case-insensitive).
// ok=false means the value was empty or unrecognized (leave prior state).
func parseFailStepsFlag(raw string) (val bool, ok bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes":
		return true, true
	case "0", "false", "no":
		return false, true
	default:
		return false, false
	}
}

// failStepsQueryValue reads failSteps from query under canonical + alias keys.
// Keys (first hit wins): failSteps, fail-steps, failsteps, fail_steps.
func failStepsQueryValue(params url.Values) string {
	for _, k := range []string{"failSteps", "fail-steps", "failsteps", "fail_steps"} {
		if v := params.Get(k); v != "" {
			return v
		}
	}
	return ""
}

// encodeShareFocus percent-encodes focus for safe URL fragments while keeping ':'
// (e.g. scn:/spec: prefixes) readable. Spaces and non-ASCII must be encoded so
// URL.hash round-trips do not leave a percent-encoded focus that no longer matches DOM ids.
func encodeShareFocus(focus string) string {
	enc := url.PathEscape(focus)
	enc = strings.ReplaceAll(enc, "%3A", ":")
	enc = strings.ReplaceAll(enc, "%3a", ":")
	return enc
}

func decodeShareFocus(focus string) string {
	if focus == "" {
		return focus
	}
	if dec, err := url.PathUnescape(focus); err == nil {
		return dec
	}
	return focus
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
	focus = decodeShareFocus(focus)
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
			if fs := failStepsQueryValue(params); fs != "" {
				if v, ok := parseFailStepsFlag(fs); ok {
					out.FailSteps = v
				}
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
	focus = encodeShareFocus(focus)
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
