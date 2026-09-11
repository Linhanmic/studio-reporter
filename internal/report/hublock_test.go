package report

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
)

func TestWithHubLockSerializesCriticalSection(t *testing.T) {
	dir := t.TempDir()
	var concurrent int32
	var maxConcurrent int32
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := WithHubLock(dir, func() error {
				cur := atomic.AddInt32(&concurrent, 1)
				for {
					old := atomic.LoadInt32(&maxConcurrent)
					if cur <= old || atomic.CompareAndSwapInt32(&maxConcurrent, old, cur) {
						break
					}
				}
				time.Sleep(20 * time.Millisecond)
				atomic.AddInt32(&concurrent, -1)
				return nil
			})
			if err != nil {
				t.Errorf("WithHubLock: %v", err)
			}
		}()
	}
	wg.Wait()
	if maxConcurrent != 1 {
		t.Fatalf("max concurrent holders = %d, want 1", maxConcurrent)
	}
	if _, err := os.Stat(filepath.Join(dir, HubLockFileName)); err != nil {
		t.Fatalf("lock file missing: %v", err)
	}
}

func TestConcurrentFinalWritesLeaveConsistentHub(t *testing.T) {
	hub := t.TempDir()
	var wg sync.WaitGroup
	errs := make(chan error, 6)
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			r := &Report{
				ProjectName: fmt.Sprintf("proj-%d", i),
				Timestamp:   fmt.Sprintf("2026-09-11_15.00.0%d", i),
				Verdict:     VerdictPass,
			}
			src := &gauge_messages.SuiteExecutionResult{
				SuiteResult: &gauge_messages.ProtoSuiteResult{ProjectName: r.ProjectName},
			}
			_, err := (&FinalWriter{}).Write(hub, r, src)
			errs <- err
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("Write: %v", err)
		}
	}
	if _, err := os.Stat(filepath.Join(hub, IndexFile)); err != nil {
		t.Fatalf("index.html missing: %v", err)
	}
	matches, err := filepath.Glob(filepath.Join(hub, "*"+UhilReportExt))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 1 {
		t.Fatalf("hub *.uhilreport count = %d, want 1 (got %v)", len(matches), matches)
	}
}
