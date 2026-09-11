//go:build windows

package report

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows"
)

func lockHub(dir string) (func(), error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create hub dir for lock: %w", err)
	}
	path := filepath.Join(dir, HubLockFileName)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open hub lock: %w", err)
	}
	var ol windows.Overlapped
	err = windows.LockFileEx(
		windows.Handle(f.Fd()),
		windows.LOCKFILE_EXCLUSIVE_LOCK,
		0,
		1,
		0,
		&ol,
	)
	if err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("acquire hub lock: %w", err)
	}
	return func() {
		var ol2 windows.Overlapped
		_ = windows.UnlockFileEx(windows.Handle(f.Fd()), 0, 1, 0, &ol2)
		_ = f.Close()
	}, nil
}
