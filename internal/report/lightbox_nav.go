package report

// StepLightboxIndex advances a 0-based gallery index by delta with wrap-around.
// Mirrors the contract used by static_report.js lightbox ←/→ navigation.
func StepLightboxIndex(current, delta, total int) int {
	if total <= 0 {
		return -1
	}
	if current < 0 || current >= total {
		if delta >= 0 {
			return 0
		}
		return total - 1
	}
	n := total
	return (current + delta%n + n) % n
}
