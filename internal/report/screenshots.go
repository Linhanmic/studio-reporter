package report

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
)

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

