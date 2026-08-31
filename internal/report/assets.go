package report

import (
	"embed"
	"fmt"
	"os"
	"path"
	"path/filepath"
)

//go:embed viewer.html
var viewerHTMLPage []byte

//go:embed manage.html
var manageHTMLPage []byte

//go:embed report-assets
var embeddedAssets embed.FS

// WriteAssets copies live viewer assets, viewer.html, and manage.html into dir.
func WriteAssets(dir string) error {
	destDir := filepath.Join(dir, "assets")
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return fmt.Errorf("create assets directory: %w", err)
	}
	entries, err := embeddedAssets.ReadDir("report-assets")
	if err != nil {
		return fmt.Errorf("read embedded assets: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		data, err := embeddedAssets.ReadFile(path.Join("report-assets", name))
		if err != nil {
			return fmt.Errorf("read asset %s: %w", name, err)
		}
		if err := os.WriteFile(filepath.Join(destDir, name), data, 0o644); err != nil {
			return fmt.Errorf("write asset %s: %w", name, err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, ViewerFile), viewerHTMLPage, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", ViewerFile, err)
	}
	if err := os.WriteFile(filepath.Join(dir, ManageIndexFile), manageHTMLPage, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", ManageIndexFile, err)
	}
	return nil
}
