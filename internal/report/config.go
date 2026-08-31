package report

import (
	"os"
	"strings"
)

func ShouldSkipReport() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(SkipReportEnv)))
	return v == "true" || v == "1" || v == "yes"
}

func ShouldOverwriteReports() bool {
	v := strings.ToLower(firstNonEmptyEnv(OverwriteReportsEnv, OverwriteReportsEnvAlias))
	if v == "" {
		return true
	}
	return v == "true" || v == "1" || v == "yes" || v == "on"
}
