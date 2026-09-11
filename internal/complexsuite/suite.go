// Package complexsuite builds a dense synthetic Gauge SuiteExecutionResult that mirrors
// testdata/complex-gauge specs. Used for demo generation and reporter regression coverage
// without requiring a Gauge runtime.
package complexsuite

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/getgauge/gauge-proto/go/gauge_messages"
)

const (
	ProjectName  = "complex-gauge"
	Environment  = "ci"
	TimestampISO = "2026-09-11T14:30:00Z"
)

// Suite returns a rich SuiteExecutionResult covering nested concepts, table-driven
// scenarios, hooks, screenshots, skips, CJK text, multiline params, and retries.
// shotDir, when non-empty, receives two minimal PNGs referenced by failing steps.
func Suite(shotDir string) *gauge_messages.SuiteExecutionResult {
	shots := ensureShots(shotDir)
	return &gauge_messages.SuiteExecutionResult{
		SuiteResult: &gauge_messages.ProtoSuiteResult{
			ProjectName:             ProjectName,
			Environment:             Environment,
			Tags:                    "complex,regression",
			ExecutionTime:           8450,
			SuccessRate:             62.5,
			Failed:                  true,
			SpecsFailedCount:        4,
			SpecsSkippedCount:       1,
			TimestampISO:            TimestampISO,
			PreHookMessages:         []string{"suite: before — seed fixtures"},
			PostHookMessages:        []string{"suite: after — collect artifacts"},
			PreHookFailure:          nil,
			PostHookScreenshotFiles: []string{},
			SpecResults: []*gauge_messages.ProtoSpecResult{
				loginSpec(),
				cartSpec(),
				paymentSpec(shots.failPNG),
				searchSpec(),
				adminSpec(),
				hooksSpec(shots.beforePNG, shots.afterPNG),
				nestedConceptsSpec(),
				skippedSpec(),
			},
		},
	}
}

type shotFiles struct {
	failPNG   string
	beforePNG string
	afterPNG  string
}

func ensureShots(dir string) shotFiles {
	png := minimalPNG()
	out := shotFiles{
		failPNG:   "fail-payment.png",
		beforePNG: "debug-before.png",
		afterPNG:  "debug-after.png",
	}
	if dir == "" {
		return out
	}
	_ = os.MkdirAll(dir, 0o755)
	for _, name := range []string{out.failPNG, out.beforePNG, out.afterPNG} {
		path := filepath.Join(dir, name)
		_ = os.WriteFile(path, png, 0o644)
		switch name {
		case out.failPNG:
			out.failPNG = path
		case out.beforePNG:
			out.beforePNG = path
		case out.afterPNG:
			out.afterPNG = path
		}
	}
	return out
}

func minimalPNG() []byte {
	return []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
		0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
		0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00,
		0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
	}
}

func loginSpec() *gauge_messages.ProtoSpecResult {
	pass := scenario("Successful login with concept", gauge_messages.ExecutionStatus_PASSED, 520,
		[]string{"happy-path"},
		[]*gauge_messages.ProtoItem{passStep("Open browser", 30)},
		[]*gauge_messages.ProtoItem{
			passStepStatic("Enter username as \"管理员\"", "Enter username as {}", "管理员", 60),
			passStepStatic("Enter password as \"s3cret\"", "Enter password as {}", "s3cret", 40),
			concept("Log in with MFA", 280, []*gauge_messages.ProtoItem{
				passStep("Submit credentials", 80),
				passStepStatic("Enter OTP \"123456\"", "Enter OTP {}", "123456", 90),
				passStep("Wait for dashboard", 110),
			}),
		},
		[]*gauge_messages.ProtoItem{passStep("Close browser", 20)},
	)
	fail := scenario("Login rejected", gauge_messages.ExecutionStatus_FAILED, 310,
		[]string{"negative"},
		[]*gauge_messages.ProtoItem{passStep("Open browser", 25)},
		[]*gauge_messages.ProtoItem{
			passStepStatic("Enter username as \"guest\"", "Enter username as {}", "guest", 40),
			passStepStatic("Enter password as \"bad\"", "Enter password as {}", "bad", 35),
			failStep("Log in with MFA", "invalid credentials", 180, ""),
		},
		[]*gauge_messages.ProtoItem{passStep("Close browser", 15)},
	)
	return &gauge_messages.ProtoSpecResult{
		Failed: true, ExecutionTime: 830, ScenarioCount: 2, ScenarioFailedCount: 1,
		ProtoSpec: &gauge_messages.ProtoSpec{
			SpecHeading: "Login", FileName: "specs/auth/login.spec", Tags: []string{"auth", "smoke"},
			Items: []*gauge_messages.ProtoItem{pass, fail},
		},
	}
}

func cartSpec() *gauge_messages.ProtoSpecResult {
	table := &gauge_messages.ProtoTable{
		Headers: &gauge_messages.ProtoTableRow{Cells: []string{"item", "qty"}},
		Rows: []*gauge_messages.ProtoTableRow{
			{Cells: []string{"book", "1"}},
			{Cells: []string{"pen", "3"}},
			{Cells: []string{"laptop", "1"}},
		},
	}
	rows := []*gauge_messages.ProtoItem{
		tableDrivenSpec(0, true, "Add item to cart", gauge_messages.ExecutionStatus_PASSED, 200, table, []*gauge_messages.ProtoItem{
			passStep("Open shop", 40),
			passStep("Add book × 1 to cart", 80),
			passStep("Cart should contain book", 60),
		}),
		tableDrivenSpec(1, true, "Add item to cart", gauge_messages.ExecutionStatus_PASSED, 180, table, []*gauge_messages.ProtoItem{
			passStep("Open shop", 35),
			passStep("Add pen × 3 to cart", 70),
			passStep("Cart should contain pen", 50),
		}),
		tableDrivenSpec(2, true, "Add item to cart", gauge_messages.ExecutionStatus_FAILED, 240, table, []*gauge_messages.ProtoItem{
			passStep("Open shop", 30),
			failStep("Add laptop × 1 to cart", "inventory depleted", 150, ""),
			passStep("Cart should contain laptop", 20),
		}),
	}
	return &gauge_messages.ProtoSpecResult{
		Failed: true, ExecutionTime: 620, ScenarioCount: 3, ScenarioFailedCount: 1,
		ProtoSpec: &gauge_messages.ProtoSpec{
			SpecHeading: "Shopping cart", FileName: "specs/checkout/cart.spec", Tags: []string{"checkout"},
			IsTableDriven: true,
			Items: append([]*gauge_messages.ProtoItem{{
				ItemType: gauge_messages.ProtoItem_Table,
				Table:    table,
			}}, rows...),
		},
	}
}

func paymentSpec(failShot string) *gauge_messages.ProtoSpecResult {
	ok := scenario("Pay with nested concept", gauge_messages.ExecutionStatus_PASSED, 900, nil, nil,
		[]*gauge_messages.ProtoItem{
			passStep("Prepare checkout session", 100),
			concept("Complete payment of \"99.00\" with card \"4111********1111\"", 700, []*gauge_messages.ProtoItem{
				passStepStatic("Validate card \"4111********1111\"", "Validate card {}", "4111********1111", 120),
				passStepStatic("Charge \"99.00\"", "Charge {}", "99.00", 400),
				passStep("Persist transaction", 150),
			}),
			passStep("Assert receipt", 80),
		}, nil)
	declined := scenario("Declined payment with screenshot", gauge_messages.ExecutionStatus_FAILED, 650, nil, nil,
		[]*gauge_messages.ProtoItem{
			passStep("Prepare checkout session", 90),
			concept("Complete payment of \"0.01\" with card \"4000********0002\"", 480, []*gauge_messages.ProtoItem{
				passStepStatic("Validate card \"4000********0002\"", "Validate card {}", "4000********0002", 100),
				failStepShot("Charge \"0.01\"", "card declined", 320, failShot),
				passStep("Persist transaction", 10),
			}),
			passStep("Assert receipt", 20),
		}, nil)
	return &gauge_messages.ProtoSpecResult{
		Failed: true, ExecutionTime: 1550, ScenarioCount: 2, ScenarioFailedCount: 1,
		ProtoSpec: &gauge_messages.ProtoSpec{
			SpecHeading: "Payment gateway", FileName: "specs/checkout/payment.spec",
			Tags:  []string{"checkout", "payments"},
			Items: []*gauge_messages.ProtoItem{ok, declined},
		},
	}
}

func searchSpec() *gauge_messages.ProtoSpecResult {
	table := &gauge_messages.ProtoTable{
		Headers: &gauge_messages.ProtoTableRow{Cells: []string{"query", "expect"}},
		Rows: []*gauge_messages.ProtoTableRow{
			{Cells: []string{"laptop", "12"}},
			{Cells: []string{"手机", "3"}},
			{Cells: []string{"unknown", "0"}},
		},
	}
	mk := func(row int32, q, expect string, status gauge_messages.ExecutionStatus, ms int64, err string) *gauge_messages.ProtoItem {
		items := []*gauge_messages.ProtoItem{
			passStep("Open catalog", 40),
			passStepDynamic("Search for \""+q+"\"", "Search for {}", q, 70),
		}
		if status == gauge_messages.ExecutionStatus_FAILED {
			items = append(items, failStep("Expect "+expect+" results", err, 50, ""))
		} else {
			items = append(items, passStep("Expect "+expect+" results", 50))
		}
		return tableDrivenScenario(row, "Search catalog", status, ms, table, items)
	}
	return &gauge_messages.ProtoSpecResult{
		Failed: false, ExecutionTime: 720, ScenarioCount: 3, ScenarioFailedCount: 0,
		ProtoSpec: &gauge_messages.ProtoSpec{
			SpecHeading: "Catalog search", FileName: "specs/catalog/search.spec", Tags: []string{"catalog"},
			Items: []*gauge_messages.ProtoItem{
				mk(0, "laptop", "12", gauge_messages.ExecutionStatus_PASSED, 200, ""),
				mk(1, "手机", "3", gauge_messages.ExecutionStatus_PASSED, 210, ""),
				mk(2, "unknown", "0", gauge_messages.ExecutionStatus_PASSED, 180, ""),
			},
		},
	}
}

func adminSpec() *gauge_messages.ProtoSpecResult {
	profile := "name: Alice\nrole: editor\nnote: multiline\nprofile"
	scn := &gauge_messages.ProtoItem{
		ItemType: gauge_messages.ProtoItem_Scenario,
		Scenario: &gauge_messages.ProtoScenario{
			ScenarioHeading:  "Create user with profile",
			Tags:             []string{"crud"},
			ExecutionTime:    640,
			ExecutionStatus:  gauge_messages.ExecutionStatus_PASSED,
			RetriesCount:     1,
			PreHookMessages:  []string{"admin: before scenario"},
			PostHookMessages: []string{"admin: after scenario"},
			ScenarioItems: []*gauge_messages.ProtoItem{
				passStep("Open admin console", 50),
				passStepMultiline("Create user with profile", "Create user with profile", profile, 220),
				passStep("Save user", 80),
				passStepStatic("Verify user \"Alice\" exists", "Verify user {} exists", "Alice", 90),
			},
		},
	}
	return &gauge_messages.ProtoSpecResult{
		Failed: false, ExecutionTime: 640, ScenarioCount: 1,
		ProtoSpec: &gauge_messages.ProtoSpec{
			SpecHeading: "User administration", FileName: "specs/admin/users.spec", Tags: []string{"admin"},
			PreHookMessages: []string{"spec: load admin fixtures"},
			Items:           []*gauge_messages.ProtoItem{scn},
		},
	}
}

func hooksSpec(before, after string) *gauge_messages.ProtoSpecResult {
	step := &gauge_messages.ProtoStep{
		ActualText:              "Trigger flaky assertion",
		ParsedText:              "Trigger flaky assertion",
		PreHookScreenshotFiles:  []string{before},
		PostHookScreenshotFiles: []string{after},
		StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
			ExecutionResult: &gauge_messages.ProtoExecutionResult{
				Failed: true, ErrorMessage: "assertion intermittent", StackTrace: "at assertFlaky()",
				ExecutionTime: 300, ScreenshotFiles: []string{before, after},
				FailureScreenshotFile: after,
			},
		},
	}
	scn := scenario("Suite-visible scenario with screenshots", gauge_messages.ExecutionStatus_FAILED, 420, nil, nil,
		[]*gauge_messages.ProtoItem{
			{ItemType: gauge_messages.ProtoItem_Step, Step: &gauge_messages.ProtoStep{
				ActualText: "Capture debug screenshot \"before\"", ParsedText: "Capture debug screenshot {}",
				StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
					ExecutionResult: &gauge_messages.ProtoExecutionResult{
						Failed: false, ExecutionTime: 40, ScreenshotFiles: []string{before},
					},
				},
				Fragments: staticFrags("Capture debug screenshot ", "before"),
			}},
			{ItemType: gauge_messages.ProtoItem_Step, Step: step},
			{ItemType: gauge_messages.ProtoItem_Step, Step: &gauge_messages.ProtoStep{
				ActualText: "Capture debug screenshot \"after\"", ParsedText: "Capture debug screenshot {}",
				StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
					ExecutionResult: &gauge_messages.ProtoExecutionResult{
						Failed: false, ExecutionTime: 40, ScreenshotFiles: []string{after},
					},
				},
				Fragments: staticFrags("Capture debug screenshot ", "after"),
			}},
		}, nil)
	return &gauge_messages.ProtoSpecResult{
		Failed: true, ExecutionTime: 420, ScenarioCount: 1, ScenarioFailedCount: 1,
		ProtoSpec: &gauge_messages.ProtoSpec{
			SpecHeading: "Hooks and screenshots", FileName: "specs/edge/hooks-and-screenshots.spec",
			Tags:  []string{"edge"},
			Items: []*gauge_messages.ProtoItem{scn},
		},
	}
}

func nestedConceptsSpec() *gauge_messages.ProtoSpecResult {
	// Run onboarding flow → Create workspace → Allocate/Seed ; Invite ; Finish
	innerWorkspace := concept("Create workspace", 260, []*gauge_messages.ProtoItem{
		passStep("Allocate tenant", 100),
		passStep("Seed defaults", 120),
	})
	onboarding := concept("Run onboarding flow", 520, []*gauge_messages.ProtoItem{
		innerWorkspace,
		passStepStatic("Invite teammate \"bob@example.com\"", "Invite teammate {}", "bob@example.com", 130),
		passStep("Finish tour", 90),
	})
	scn := scenario("Nested concept chain", gauge_messages.ExecutionStatus_PASSED, 540, nil, nil,
		[]*gauge_messages.ProtoItem{onboarding}, nil)
	return &gauge_messages.ProtoSpecResult{
		Failed: false, ExecutionTime: 540, ScenarioCount: 1,
		ProtoSpec: &gauge_messages.ProtoSpec{
			SpecHeading: "Deep nested concepts", FileName: "specs/edge/nested-concepts.spec",
			Tags:  []string{"edge", "concepts"},
			Items: []*gauge_messages.ProtoItem{scn},
		},
	}
}

func skippedSpec() *gauge_messages.ProtoSpecResult {
	return &gauge_messages.ProtoSpecResult{
		Failed: false, Skipped: true, ExecutionTime: 0, ScenarioCount: 1, ScenarioSkippedCount: 1,
		Errors: []*gauge_messages.Error{{
			Type: gauge_messages.Error_VALIDATION_ERROR, Filename: "specs/edge/skipped.spec",
			LineNumber: 5, Message: "Step implementation not found",
		}},
		ProtoSpec: &gauge_messages.ProtoSpec{
			SpecHeading: "Skipped / validation errors", FileName: "specs/edge/skipped.spec",
			Tags: []string{"edge", "skip"},
			Items: []*gauge_messages.ProtoItem{{
				ItemType: gauge_messages.ProtoItem_Scenario,
				Scenario: &gauge_messages.ProtoScenario{
					ScenarioHeading: "Missing step is skipped",
					ExecutionStatus: gauge_messages.ExecutionStatus_SKIPPED,
					SkipErrors:      []string{"Step implementation not found"},
					ScenarioItems: []*gauge_messages.ProtoItem{{
						ItemType: gauge_messages.ProtoItem_Step,
						Step: &gauge_messages.ProtoStep{
							ActualText: "This step is intentionally unimplemented",
							StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
								Skipped: true, SkippedReason: "Step implementation not found",
							},
						},
					}},
				},
			}},
		},
	}
}

// --- helpers ---

func scenario(heading string, status gauge_messages.ExecutionStatus, ms int64, tags []string, ctx, items, td []*gauge_messages.ProtoItem) *gauge_messages.ProtoItem {
	return &gauge_messages.ProtoItem{
		ItemType: gauge_messages.ProtoItem_Scenario,
		Scenario: &gauge_messages.ProtoScenario{
			ScenarioHeading: heading, Tags: tags, ExecutionTime: ms, ExecutionStatus: status,
			Contexts: ctx, ScenarioItems: items, TearDownSteps: td,
		},
	}
}

func tableDrivenSpec(row int32, specTable bool, heading string, status gauge_messages.ExecutionStatus, ms int64, table *gauge_messages.ProtoTable, items []*gauge_messages.ProtoItem) *gauge_messages.ProtoItem {
	td := &gauge_messages.ProtoTableDrivenScenario{
		IsSpecTableDriven: specTable,
		TableRowIndex:     row,
		Scenario: &gauge_messages.ProtoScenario{
			ScenarioHeading: heading, ExecutionTime: ms, ExecutionStatus: status, ScenarioItems: items, Tags: []string{"cart"},
		},
	}
	if !specTable {
		td.IsScenarioTableDriven = true
		td.ScenarioTableRowIndex = row
		td.ScenarioDataTable = table
	}
	return &gauge_messages.ProtoItem{ItemType: gauge_messages.ProtoItem_TableDrivenScenario, TableDrivenScenario: td}
}

func tableDrivenScenario(row int32, heading string, status gauge_messages.ExecutionStatus, ms int64, table *gauge_messages.ProtoTable, items []*gauge_messages.ProtoItem) *gauge_messages.ProtoItem {
	return &gauge_messages.ProtoItem{
		ItemType: gauge_messages.ProtoItem_TableDrivenScenario,
		TableDrivenScenario: &gauge_messages.ProtoTableDrivenScenario{
			IsScenarioTableDriven: true,
			ScenarioTableRowIndex: row,
			ScenarioDataTable:     table,
			Scenario: &gauge_messages.ProtoScenario{
				ScenarioHeading: heading, ExecutionTime: ms, ExecutionStatus: status, ScenarioItems: items,
			},
		},
	}
}

func concept(text string, ms int64, steps []*gauge_messages.ProtoItem) *gauge_messages.ProtoItem {
	return &gauge_messages.ProtoItem{
		ItemType: gauge_messages.ProtoItem_Concept,
		Concept: &gauge_messages.ProtoConcept{
			ConceptStep: &gauge_messages.ProtoStep{ActualText: text, ParsedText: text},
			ConceptExecutionResult: &gauge_messages.ProtoStepExecutionResult{
				ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: ms},
			},
			Steps: steps,
		},
	}
}

func passStep(text string, ms int64) *gauge_messages.ProtoItem {
	return &gauge_messages.ProtoItem{
		ItemType: gauge_messages.ProtoItem_Step,
		Step: &gauge_messages.ProtoStep{
			ActualText: text, ParsedText: text,
			StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
				ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: ms},
			},
		},
	}
}

func failStep(text, err string, ms int64, shot string) *gauge_messages.ProtoItem {
	return failStepShot(text, err, ms, shot)
}

func failStepShot(text, err string, ms int64, shot string) *gauge_messages.ProtoItem {
	res := &gauge_messages.ProtoExecutionResult{
		Failed: true, ErrorMessage: err, StackTrace: "at " + text, ExecutionTime: ms,
	}
	if shot != "" {
		res.FailureScreenshotFile = shot
		res.ScreenshotFiles = []string{shot}
	}
	return &gauge_messages.ProtoItem{
		ItemType: gauge_messages.ProtoItem_Step,
		Step: &gauge_messages.ProtoStep{
			ActualText: text, ParsedText: text,
			StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{ExecutionResult: res},
		},
	}
}

func passStepStatic(actual, parsed, value string, ms int64) *gauge_messages.ProtoItem {
	return &gauge_messages.ProtoItem{
		ItemType: gauge_messages.ProtoItem_Step,
		Step: &gauge_messages.ProtoStep{
			ActualText: actual, ParsedText: parsed,
			Fragments: staticFragsFrom(actual, value),
			StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
				ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: ms},
			},
		},
	}
}

func passStepDynamic(actual, parsed, value string, ms int64) *gauge_messages.ProtoItem {
	return &gauge_messages.ProtoItem{
		ItemType: gauge_messages.ProtoItem_Step,
		Step: &gauge_messages.ProtoStep{
			ActualText: actual, ParsedText: parsed,
			Fragments: []*gauge_messages.Fragment{
				{FragmentType: gauge_messages.Fragment_Text, Text: "Search for "},
				{FragmentType: gauge_messages.Fragment_Parameter, Parameter: &gauge_messages.Parameter{
					ParameterType: gauge_messages.Parameter_Dynamic, Value: value, Name: "query",
				}},
			},
			StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
				ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: ms},
			},
		},
	}
}

func passStepMultiline(actual, parsed, value string, ms int64) *gauge_messages.ProtoItem {
	return &gauge_messages.ProtoItem{
		ItemType: gauge_messages.ProtoItem_Step,
		Step: &gauge_messages.ProtoStep{
			ActualText: actual, ParsedText: parsed,
			Fragments: []*gauge_messages.Fragment{
				{FragmentType: gauge_messages.Fragment_Text, Text: actual + "\n"},
				{FragmentType: gauge_messages.Fragment_Parameter, Parameter: &gauge_messages.Parameter{
					ParameterType: gauge_messages.Parameter_Special_String, Value: value, Name: "profile",
				}},
			},
			StepExecutionResult: &gauge_messages.ProtoStepExecutionResult{
				ExecutionResult: &gauge_messages.ProtoExecutionResult{Failed: false, ExecutionTime: ms, Message: []string{"created user Alice"}},
			},
		},
	}
}

func staticFrags(prefix, value string) []*gauge_messages.Fragment {
	return []*gauge_messages.Fragment{
		{FragmentType: gauge_messages.Fragment_Text, Text: prefix},
		{FragmentType: gauge_messages.Fragment_Parameter, Parameter: &gauge_messages.Parameter{
			ParameterType: gauge_messages.Parameter_Static, Value: value,
		}},
	}
}

func staticFragsFrom(actual, value string) []*gauge_messages.Fragment {
	needle := "\"" + value + "\""
	if idx := strings.Index(actual, needle); idx >= 0 {
		return []*gauge_messages.Fragment{
			{FragmentType: gauge_messages.Fragment_Text, Text: actual[:idx]},
			{FragmentType: gauge_messages.Fragment_Parameter, Parameter: &gauge_messages.Parameter{
				ParameterType: gauge_messages.Parameter_Static, Value: value,
			}},
			{FragmentType: gauge_messages.Fragment_Text, Text: actual[idx+len(needle):]},
		}
	}
	return staticFrags(actual+" ", value)
}
