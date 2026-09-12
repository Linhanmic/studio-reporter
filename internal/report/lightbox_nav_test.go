package report

import "testing"

func TestStepLightboxIndex(t *testing.T) {
	cases := []struct {
		cur, delta, total, want int
	}{
		{0, 1, 3, 1},
		{2, 1, 3, 0},
		{0, -1, 3, 2},
		{1, -1, 3, 0},
		{0, 1, 0, -1},
		{0, 1, -2, -1},
		{-1, 1, 4, 0},
		{-1, -1, 4, 3},
		{5, 1, 4, 0},
		{1, 5, 3, 0}, // 1+5 ≡ 0 (mod 3)
		{1, -5, 3, 2},
	}
	for _, tc := range cases {
		got := StepLightboxIndex(tc.cur, tc.delta, tc.total)
		if got != tc.want {
			t.Fatalf("StepLightboxIndex(%d,%d,%d)=%d want %d", tc.cur, tc.delta, tc.total, got, tc.want)
		}
	}
}
