package report

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInlineLocalImagesAndWriteSingleHTML(t *testing.T) {
	dir := t.TempDir()
	imgDir := filepath.Join(dir, "images")
	if err := os.MkdirAll(imgDir, 0o755); err != nil {
		t.Fatal(err)
	}
	// 1x1 PNG
	png, err := base64.StdEncoding.DecodeString(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	)
	if err != nil {
		t.Fatal(err)
	}
	imgRel := filepath.ToSlash(filepath.Join("images", "dot.png"))
	if err := os.WriteFile(filepath.Join(imgDir, "dot.png"), png, 0o644); err != nil {
		t.Fatal(err)
	}
	index := filepath.Join(dir, "index.html")
	html := `<!DOCTYPE html><html><body>` +
		`<img src="` + imgRel + `">` +
		`<button data-shot-src="` + imgRel + `"></button>` +
		`<img src="https://example.com/x.png">` +
		`<img src="images/missing.png">` +
		`</body></html>`
	if err := os.WriteFile(index, []byte(html), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := InlineLocalImages([]byte(html), dir)
	if err != nil {
		t.Fatal(err)
	}
	body := string(got)
	if !strings.Contains(body, "data:image/png;base64,") {
		t.Fatalf("expected data URI, got:\n%s", body)
	}
	if strings.Count(body, "data:image/png;base64,") != 2 {
		t.Fatalf("src and data-shot-src should both inline, got %d", strings.Count(body, "data:image/png;base64,"))
	}
	if !strings.Contains(body, `src="https://example.com/x.png"`) {
		t.Fatal("remote URL must stay untouched")
	}
	if !strings.Contains(body, `src="images/missing.png"`) {
		t.Fatal("missing local file should remain as relative path")
	}

	single := filepath.Join(dir, "out.single.html")
	if err := WriteSingleHTML(index, single); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(single)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "data:image/png;base64,") {
		t.Fatal("written single file missing data URI")
	}

	// Path escape must be refused (left as-is via cache miss path).
	evil := []byte(`<img src="../secret.png">`)
	out, err := InlineLocalImages(evil, dir)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(out), "data:") {
		t.Fatal("must not inline path escaping base dir")
	}
}

func TestFinalWriterWritesSingleHTML(t *testing.T) {
	dir := t.TempDir()
	imgDir := filepath.Join(dir, "images")
	_ = os.MkdirAll(imgDir, 0o755)
	png, _ := base64.StdEncoding.DecodeString(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	)
	_ = os.WriteFile(filepath.Join(imgDir, "a.png"), png, 0o644)

	on := true
	w := &FinalWriter{WriteSingleHTML: &on, WritePDF: boolPtr(false)}
	r := &Report{
		ProjectName: "single-demo",
		Duration:    "00:00:01.000",
		Verdict:     VerdictFail,
		Specs: []SpecReport{{
			ID:      "spec:1",
			Heading: "S",
			Verdict: VerdictFail,
			Scenarios: []ScenarioReport{{
				ID:      "scn:1",
				Heading: "C",
				Verdict: VerdictFail,
				Items: []ItemReport{{
					Kind: "step",
					Step: &StepReport{
						ActualText:  "shot",
						Verdict:     VerdictFail,
						Screenshots: []string{filepath.ToSlash(filepath.Join("images", "a.png"))},
					},
				}},
			}},
		}},
	}
	// Minimal empty proto is not needed if Write only uses src for uhileport marshal —
	// Write requires proto.Message. Use Generate path via writing HTML only through helper.
	html, err := RenderReportHTML(r)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, IndexFile), html, 0o644); err != nil {
		t.Fatal(err)
	}
	if !w.wantSingleHTML() {
		t.Fatal("wantSingleHTML")
	}
	single := filepath.Join(dir, SingleHTMLFile)
	if err := WriteSingleHTML(filepath.Join(dir, IndexFile), single); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(single)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "data:image/png;base64,") {
		t.Fatal("expected inlined screenshot in single HTML")
	}
}

func boolPtr(v bool) *bool { return &v }
