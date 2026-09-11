package report

import (
	"sort"
	"strings"
)

// FailReasonRef is one scenario (or suite-level hook) that shares a reason.
type FailReasonRef struct {
	SpecID   string
	SpecName string
	ScnID    string
	ScnName  string
}

// FailReasonGroup clusters failed scenarios by normalized primary error text.
type FailReasonGroup struct {
	Reason string
	Count  int
	Refs   []FailReasonRef
}

// normalizeFailReason keeps the first meaningful line and collapses whitespace.
func normalizeFailReason(msg string) string {
	msg = strings.ReplaceAll(msg, "\r\n", "\n")
	msg = strings.ReplaceAll(msg, "\r", "\n")
	lines := strings.Split(msg, "\n")
	for _, line := range lines {
		line = strings.Join(strings.Fields(line), " ")
		if line != "" {
			if len(line) > 240 {
				return line[:240] + "…"
			}
			return line
		}
	}
	return ""
}

func hookFailReason(h *HookFailure) string {
	if h == nil {
		return ""
	}
	msg := normalizeFailReason(h.ErrorMessage)
	if msg == "" {
		return ""
	}
	name := strings.TrimSpace(h.HookName)
	if name != "" {
		return name + ": " + msg
	}
	return msg
}

func firstHookReason(hooks ...*HookFailure) string {
	for _, h := range hooks {
		if msg := hookFailReason(h); msg != "" {
			return msg
		}
	}
	return ""
}

func itemFailReason(it ItemReport) string {
	switch it.Kind {
	case "step":
		if it.Step == nil {
			return ""
		}
		if it.Step.Verdict != VerdictFail {
			// Still surface hook failures on otherwise non-fail steps.
			return firstHookReason(it.Step.PreHookFailure, it.Step.PostHookFailure)
		}
		if msg := normalizeFailReason(it.Step.ErrorMessage); msg != "" {
			return msg
		}
		return firstHookReason(it.Step.PreHookFailure, it.Step.PostHookFailure)
	case "concept":
		if it.Concept == nil {
			return ""
		}
		if it.Concept.Step != nil {
			if it.Concept.Step.Verdict == VerdictFail {
				if msg := normalizeFailReason(it.Concept.Step.ErrorMessage); msg != "" {
					return msg
				}
			}
			if msg := firstHookReason(it.Concept.Step.PreHookFailure, it.Concept.Step.PostHookFailure); msg != "" {
				return msg
			}
		}
		for _, child := range it.Concept.Items {
			if msg := itemFailReason(child); msg != "" {
				return msg
			}
		}
	}
	return ""
}

func scenarioPrimaryFailReason(scn ScenarioReport) string {
	if msg := firstHookReason(scn.PreHookFailure, scn.PostHookFailure); msg != "" {
		return msg
	}
	for _, it := range scn.Contexts {
		if msg := itemFailReason(it); msg != "" {
			return msg
		}
	}
	for _, it := range scn.Items {
		if msg := itemFailReason(it); msg != "" {
			return msg
		}
	}
	for _, it := range scn.Teardowns {
		if msg := itemFailReason(it); msg != "" {
			return msg
		}
	}
	for _, skip := range scn.SkipErrors {
		if msg := normalizeFailReason(skip); msg != "" {
			return msg
		}
	}
	return "（未提供错误信息）"
}

// AggregateFailReasons groups failed scenarios by primary error message.
// Suite-level hook failures are included as synthetic refs (ScnID empty).
func AggregateFailReasons(r *Report) []FailReasonGroup {
	if r == nil {
		return nil
	}
	type bucket struct {
		reason string
		refs   []FailReasonRef
	}
	byKey := map[string]*bucket{}
	order := []string{}

	add := func(reason string, ref FailReasonRef) {
		key := reason
		b, ok := byKey[key]
		if !ok {
			b = &bucket{reason: reason}
			byKey[key] = b
			order = append(order, key)
		}
		b.refs = append(b.refs, ref)
	}

	if msg := firstHookReason(r.PreHookFailure, r.PostHookFailure); msg != "" {
		add(msg, FailReasonRef{SpecName: "Suite", ScnName: "Hook"})
	}

	for i := range r.Specs {
		sp := &r.Specs[i]
		for _, h := range append([]*HookFailure{}, append(sp.PreHookFailures, sp.PostHookFailures...)...) {
			if msg := hookFailReason(h); msg != "" {
				add(msg, FailReasonRef{
					SpecID:   sp.ID,
					SpecName: sp.Heading,
					ScnName:  "Spec Hook",
				})
			}
		}
		for j := range sp.Scenarios {
			scn := &sp.Scenarios[j]
			if scn.Verdict != VerdictFail {
				continue
			}
			add(scenarioPrimaryFailReason(*scn), FailReasonRef{
				SpecID:   sp.ID,
				SpecName: sp.Heading,
				ScnID:    scn.ID,
				ScnName:  scn.Heading,
			})
		}
	}

	out := make([]FailReasonGroup, 0, len(order))
	for _, key := range order {
		b := byKey[key]
		out = append(out, FailReasonGroup{
			Reason: b.reason,
			Count:  len(b.refs),
			Refs:   b.refs,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].Reason < out[j].Reason
	})
	return out
}
