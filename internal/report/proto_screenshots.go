package report

import (
	"github.com/getgauge/gauge-proto/go/gauge_messages"
	"google.golang.org/protobuf/proto"
)

// rewriteProtoScreenshotPaths rewrites Gauge screenshot file fields using mapping
// so the marshaled .uhilreport stores portable images/... paths.
func rewriteProtoScreenshotPaths(src proto.Message, mapping map[string]string) {
	if len(mapping) == 0 || src == nil {
		return
	}
	suite, ok := src.(*gauge_messages.SuiteExecutionResult)
	if !ok || suite.GetSuiteResult() == nil {
		return
	}
	mapList := func(list []string) []string {
		if len(list) == 0 {
			return list
		}
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
	mapOne := func(p string) string {
		if n, ok := mapping[p]; ok {
			return n
		}
		return p
	}
	mapHook := func(h *gauge_messages.ProtoHookFailure) {
		if h == nil {
			return
		}
		h.FailureScreenshotFile = mapOne(h.FailureScreenshotFile)
	}
	mapExec := func(res *gauge_messages.ProtoExecutionResult) {
		if res == nil {
			return
		}
		res.FailureScreenshotFile = mapOne(res.FailureScreenshotFile)
		res.ScreenshotFiles = mapList(res.ScreenshotFiles)
	}
	mapStep := func(step *gauge_messages.ProtoStep) {
		if step == nil {
			return
		}
		step.PreHookScreenshotFiles = mapList(step.PreHookScreenshotFiles)
		step.PostHookScreenshotFiles = mapList(step.PostHookScreenshotFiles)
		if ser := step.GetStepExecutionResult(); ser != nil {
			mapExec(ser.GetExecutionResult())
			mapHook(ser.GetPreHookFailure())
			mapHook(ser.GetPostHookFailure())
		}
	}
	var walkItems func([]*gauge_messages.ProtoItem)
	walkItems = func(items []*gauge_messages.ProtoItem) {
		for _, item := range items {
			if item == nil {
				continue
			}
			switch item.GetItemType() {
			case gauge_messages.ProtoItem_Step:
				mapStep(item.GetStep())
			case gauge_messages.ProtoItem_Concept:
				if c := item.GetConcept(); c != nil {
					mapStep(c.GetConceptStep())
					if cer := c.GetConceptExecutionResult(); cer != nil {
						mapExec(cer.GetExecutionResult())
						mapHook(cer.GetPreHookFailure())
						mapHook(cer.GetPostHookFailure())
					}
					walkItems(c.GetSteps())
				}
			case gauge_messages.ProtoItem_Scenario:
				rewriteProtoScenario(item.GetScenario(), mapList, mapHook, walkItems)
			case gauge_messages.ProtoItem_TableDrivenScenario:
				if td := item.GetTableDrivenScenario(); td != nil {
					rewriteProtoScenario(td.GetScenario(), mapList, mapHook, walkItems)
				}
			}
		}
	}

	psr := suite.GetSuiteResult()
	psr.PreHookScreenshotFiles = mapList(psr.PreHookScreenshotFiles)
	psr.PostHookScreenshotFiles = mapList(psr.PostHookScreenshotFiles)
	mapHook(psr.GetPreHookFailure())
	mapHook(psr.GetPostHookFailure())
	for _, res := range psr.GetSpecResults() {
		if res == nil {
			continue
		}
		spec := res.GetProtoSpec()
		if spec == nil {
			continue
		}
		spec.PreHookScreenshotFiles = mapList(spec.PreHookScreenshotFiles)
		spec.PostHookScreenshotFiles = mapList(spec.PostHookScreenshotFiles)
		for _, f := range spec.GetPreHookFailures() {
			mapHook(f)
		}
		for _, f := range spec.GetPostHookFailures() {
			mapHook(f)
		}
		walkItems(spec.GetItems())
	}
}

func rewriteProtoScenario(
	scn *gauge_messages.ProtoScenario,
	mapList func([]string) []string,
	mapHook func(*gauge_messages.ProtoHookFailure),
	walkItems func([]*gauge_messages.ProtoItem),
) {
	if scn == nil {
		return
	}
	scn.PreHookScreenshotFiles = mapList(scn.PreHookScreenshotFiles)
	scn.PostHookScreenshotFiles = mapList(scn.PostHookScreenshotFiles)
	mapHook(scn.GetPreHookFailure())
	mapHook(scn.GetPostHookFailure())
	walkItems(scn.GetContexts())
	walkItems(scn.GetScenarioItems())
	walkItems(scn.GetTearDownSteps())
}
