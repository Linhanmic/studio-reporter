package report

import (
	"bytes"
	"crypto/md5"
	"encoding/hex"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"testing"
)

// stripPDFVolatileMeta removes CreationDate/ModDate/ID so content can be compared.
func stripPDFVolatileMeta(raw []byte) []byte {
	out := raw
	out = regexp.MustCompile(`/CreationDate\s*\(.*?\)`).ReplaceAll(out, nil)
	out = regexp.MustCompile(`/ModDate\s*\(.*?\)`).ReplaceAll(out, nil)
	out = regexp.MustCompile(`/ID\s*\[(.*?)\]`).ReplaceAll(out, nil)
	return out
}

func pdfContentFingerprint(path string) (string, int64, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", 0, err
	}
	sum := md5.Sum(stripPDFVolatileMeta(raw))
	return hex.EncodeToString(sum[:]), int64(len(raw)), nil
}

func TestWritePDFFailStepsDiffersFromFull(t *testing.T) {
	if _, err := findChrome(); err != nil {
		t.Skip(err.Error())
	}

	dir := t.TempDir()
	index := filepath.Join(dir, "index.html")
	passBody := string(bytes.Repeat([]byte("pass line "), 80))
	failBody := string(bytes.Repeat([]byte("fail line "), 40))
	html := `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>pdf-fail-steps</title>
<style>
.pass { color: green; }
.fail { color: red; background: #fee; }
.fail-steps-mode .pass { display: none !important; }
@media print {
  html, body, .fail {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .fail-steps-mode .pass { display: none !important; }
}
</style>
</head>
<body>
<div class="print-scope-banner" id="print-scope-banner"></div>
<section class="pass"><h1>PASS_MARKER_UNIQUE_AAA</h1><p>` + passBody + `</p></section>
<section class="fail"><h1>FAIL_MARKER_UNIQUE_BBB</h1><p>` + failBody + `</p></section>
<script>
(function () {
  var applyingHash = true;
  function wantFailStepsFromURL() {
    return (location.hash || '').indexOf('fail-steps') >= 0;
  }
  function setFailStepsOnly(on) {
    document.documentElement.classList.toggle('fail-steps-mode', !!on);
    var el = document.getElementById('print-scope-banner');
    if (el) el.textContent = on ? '打印范围：仅失败步骤' : '打印范围：完整报告';
  }
  try {
    if (wantFailStepsFromURL()) setFailStepsOnly(true);
  } catch (e) {}
  applyingHash = false;
  window.addEventListener('beforeprint', function () {
    if (document.documentElement.classList.contains('fail-steps-mode')) {
      setFailStepsOnly(true);
    }
  });
})();
</script>
</body></html>`
	if err := os.WriteFile(index, []byte(html), 0o644); err != nil {
		t.Fatal(err)
	}

	fullPath := filepath.Join(dir, "full.pdf")
	failPath := filepath.Join(dir, "fail-steps.pdf")
	if err := writePDF(index, fullPath, false); err != nil {
		t.Fatalf("full pdf: %v", err)
	}
	if err := writePDF(index, failPath, true); err != nil {
		t.Fatalf("fail-steps pdf: %v", err)
	}

	fullFP, fullSize, err := pdfContentFingerprint(fullPath)
	if err != nil {
		t.Fatal(err)
	}
	failFP, failSize, err := pdfContentFingerprint(failPath)
	if err != nil {
		t.Fatal(err)
	}
	if fullFP == failFP {
		t.Fatalf("fail-steps PDF must differ from full PDF (both fingerprint %s, size=%d); #fail-steps boot/print path likely broken", fullFP, fullSize)
	}
	// Size ordering is not guaranteed on tiny fixtures (font subset / banner),
	// but fingerprints must diverge. Log sizes for smoke diagnosis.
	t.Logf("pdf sizes full=%d fail-steps=%d", fullSize, failSize)
}

func TestPDFChromeArgsIncludeVirtualTimeBudget(t *testing.T) {
	// Guard the print pipeline contract: without virtual-time-budget, Chromium may
	// snapshot before #fail-steps JS runs (regression caught 2026-09-11).
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	src, err := os.ReadFile(filepath.Join(filepath.Dir(thisFile), "pdf.go"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(src, []byte("--virtual-time-budget=")) {
		t.Fatal("pdf.go must pass --virtual-time-budget so fail-steps JS runs before print")
	}
}
