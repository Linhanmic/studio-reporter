package report

import (
	"path"
	"strings"
	"testing"
)

func TestManageEmbedsHistoryFailDigest(t *testing.T) {
	html := string(manageHTMLPage)
	for _, want := range []string{
		`assets/history-digest.js`,
		`StudioReporterHistoryDigest`,
		`copyFailDigest`,
		`copyFailDigestLinks`,
		`showDigest`,
		`topFailReason`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("manage.html missing %q", want)
		}
	}

	js, err := embeddedAssets.ReadFile(path.Join("report-assets", "history-digest.js"))
	if err != nil {
		t.Fatalf("read history-digest.js: %v", err)
	}
	body := string(js)
	for _, want := range []string{
		"buildHistoryFailDigest",
		"formatHistoryFailDigestMarkdown",
		"buildHistoryFailDigestOpenLinks",
		"studio-reporter://open",
		"failSteps",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("history-digest.js missing %q", want)
		}
	}
}

func TestViewerEmbedsFinalReportGuide(t *testing.T) {
	html := string(viewerHTMLPage)
	for _, want := range []string{
		`class="final-guide"`,
		`showFinalGuide`,
		`openFinalReport`,
		`stayOnLiveViewer`,
		`store.finalIndexReady`,
		`index.html`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("viewer.html missing %q", want)
		}
	}

	app, err := embeddedAssets.ReadFile(path.Join("report-assets", "report-app.js"))
	if err != nil {
		t.Fatalf("read report-app.js: %v", err)
	}
	js := string(app)
	for _, want := range []string{
		"markSuiteEnded",
		"markFinalIndexReady",
		"dismissFinalGuide",
		"beginFinalIndexWait",
		"ReportGenerated",
		"probeFinalIndex",
		"fromDiskSnapshot",
		"index.html",
	} {
		if !strings.Contains(js, want) {
			t.Fatalf("report-app.js missing %q", want)
		}
	}
}
