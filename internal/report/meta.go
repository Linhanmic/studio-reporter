package report

import (
	"os"
	"runtime"
	"strings"
	"time"
)

// ReportMeta holds environment / configuration shown on the Overview page
// (CANoe-style report header). Additive — does not bump formatVersion.
type ReportMeta struct {
	PluginVersion  string            `json:"pluginVersion,omitempty"`
	FormatVersion  int               `json:"formatVersion,omitempty"`
	HostName       string            `json:"hostName,omitempty"`
	GOOS           string            `json:"goos,omitempty"`
	GOARCH         string            `json:"goarch,omitempty"`
	NumCPU         int               `json:"numCPU,omitempty"`
	ProjectRoot    string            `json:"projectRoot,omitempty"`
	GeneratedAt    string            `json:"generatedAt,omitempty"`
	GeneratedAtISO string            `json:"generatedAtISO,omitempty"`
	Extra          map[string]string `json:"extra,omitempty"`
}

// EnrichMeta fills runtime/environment metadata when fields are empty.
// Custom pairs can be supplied via GAUGE_STUDIO_REPORT_META="k=v,k2=v2".
func EnrichMeta(r *Report) {
	if r == nil {
		return
	}
	if r.Meta.FormatVersion == 0 {
		r.Meta.FormatVersion = FormatVersion
	}
	if r.Meta.PluginVersion == "" {
		r.Meta.PluginVersion = PluginVersion
	}
	if r.Meta.HostName == "" {
		if h, err := os.Hostname(); err == nil {
			r.Meta.HostName = h
		}
	}
	if r.Meta.GOOS == "" {
		r.Meta.GOOS = runtime.GOOS
	}
	if r.Meta.GOARCH == "" {
		r.Meta.GOARCH = runtime.GOARCH
	}
	if r.Meta.NumCPU == 0 {
		r.Meta.NumCPU = runtime.NumCPU()
	}
	if r.Meta.ProjectRoot == "" {
		r.Meta.ProjectRoot = strings.TrimSpace(os.Getenv(GaugeProjectRootEnv))
	}
	now := time.Now()
	if r.Meta.GeneratedAtISO == "" {
		r.Meta.GeneratedAtISO = now.Format(time.RFC3339)
	}
	if r.Meta.GeneratedAt == "" {
		r.Meta.GeneratedAt = now.Format("2006-01-02 15:04:05")
	}
	if r.Meta.Extra == nil {
		r.Meta.Extra = map[string]string{}
	}
	for _, pair := range strings.Split(os.Getenv("GAUGE_STUDIO_REPORT_META"), ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		k, v, ok := strings.Cut(pair, "=")
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		if !ok || k == "" {
			continue
		}
		if _, exists := r.Meta.Extra[k]; !exists {
			r.Meta.Extra[k] = v
		}
	}
}
