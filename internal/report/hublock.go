package report

// HubLockFileName is the advisory lock file under a report hub directory.
const HubLockFileName = ".hub.lock"

// WithHubLock exclusively locks dir (cross-process) while fn runs.
// Used to serialize FinalWriter.Write and manage history deletes against the same hub.
func WithHubLock(dir string, fn func() error) error {
	unlock, err := lockHub(dir)
	if err != nil {
		return err
	}
	defer unlock()
	return fn()
}
