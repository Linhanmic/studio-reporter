package report

import (
	"encoding/base64"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// SingleHTMLFile is the default self-contained HTML twin of index.html.
const SingleHTMLFile = "report.single.html"

var localAssetAttrRE = regexp.MustCompile(`(?i)(\b(?:src|data-shot-src)=")([^"]+)(")`)

// InlineLocalImages rewrites relative img / data-shot-src paths in html to
// data: URIs resolved against baseDir. Absolute http(s)/data/blob URLs are left alone.
// Missing files are left as-is (best-effort) so a partial gallery still opens.
func InlineLocalImages(html []byte, baseDir string) ([]byte, error) {
	if len(html) == 0 {
		return html, nil
	}
	cache := map[string]string{}
	out := localAssetAttrRE.ReplaceAllFunc(html, func(match []byte) []byte {
		parts := localAssetAttrRE.FindSubmatch(match)
		if len(parts) != 4 {
			return match
		}
		raw := string(parts[2])
		if shouldSkipInlineURL(raw) {
			return match
		}
		dataURI, ok := cache[raw]
		if !ok {
			uri, err := fileToDataURI(baseDir, raw)
			if err != nil {
				cache[raw] = ""
				return match
			}
			dataURI = uri
			cache[raw] = uri
		}
		if dataURI == "" {
			return match
		}
		var b strings.Builder
		b.Grow(len(parts[1]) + len(dataURI) + len(parts[3]))
		b.Write(parts[1])
		b.WriteString(dataURI)
		b.Write(parts[3])
		return []byte(b.String())
	})
	return out, nil
}

// WriteSingleHTML reads indexHTML, inlines local images, and writes singlePath
// (default: sibling report.single.html).
func WriteSingleHTML(indexHTML, singlePath string) error {
	if indexHTML == "" {
		return fmt.Errorf("single-html: empty index path")
	}
	absIndex, err := filepath.Abs(indexHTML)
	if err != nil {
		return err
	}
	raw, err := os.ReadFile(absIndex)
	if err != nil {
		return fmt.Errorf("single-html: read index: %w", err)
	}
	if singlePath == "" {
		singlePath = filepath.Join(filepath.Dir(absIndex), SingleHTMLFile)
	}
	absSingle, err := filepath.Abs(singlePath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(absSingle), 0o755); err != nil {
		return err
	}
	inlined, err := InlineLocalImages(raw, filepath.Dir(absIndex))
	if err != nil {
		return err
	}
	if err := AtomicWriteFile(absSingle, inlined); err != nil {
		return fmt.Errorf("single-html: write: %w", err)
	}
	return nil
}

func shouldSkipInlineURL(raw string) bool {
	s := strings.TrimSpace(strings.ToLower(raw))
	switch {
	case s == "":
		return true
	case strings.HasPrefix(s, "data:"):
		return true
	case strings.HasPrefix(s, "http://"), strings.HasPrefix(s, "https://"):
		return true
	case strings.HasPrefix(s, "blob:"):
		return true
	case strings.HasPrefix(s, "//"):
		return true
	default:
		return false
	}
}

func fileToDataURI(baseDir, rel string) (string, error) {
	clean := filepath.Clean(filepath.FromSlash(rel))
	if filepath.IsAbs(clean) {
		return "", fmt.Errorf("refuse absolute path %q", rel)
	}
	// Block path escape outside the report directory.
	full := filepath.Join(baseDir, clean)
	relToBase, err := filepath.Rel(baseDir, full)
	if err != nil || strings.HasPrefix(relToBase, "..") {
		return "", fmt.Errorf("path escapes base: %q", rel)
	}
	data, err := os.ReadFile(full)
	if err != nil {
		return "", err
	}
	ctype := mime.TypeByExtension(strings.ToLower(filepath.Ext(full)))
	if ctype == "" {
		ctype = "application/octet-stream"
		switch strings.ToLower(filepath.Ext(full)) {
		case ".png":
			ctype = "image/png"
		case ".jpg", ".jpeg":
			ctype = "image/jpeg"
		case ".gif":
			ctype = "image/gif"
		case ".webp":
			ctype = "image/webp"
		case ".svg":
			ctype = "image/svg+xml"
		}
	}
	return "data:" + ctype + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}
