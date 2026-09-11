.PHONY: test vet build build-windows lint sync-assets check-assets cover hooks smoke-input smoke-complex demo-complex desktop-test desktop-pack desktop-pack-win desktop-pack-smoke ci all

GO ?= go
GOTOOLCHAIN ?= go1.27.0
GOLANGCI_LINT ?= golangci-lint

export GOTOOLCHAIN

sync-assets:
	./scripts/sync-assets.sh

check-assets:
	./scripts/check-assets.sh

hooks:
	git config core.hooksPath .githooks
	@echo "core.hooksPath=.githooks (pre-commit runs check-assets on frontend changes)"

test:
	$(GO) test ./...

cover:
	./scripts/cover-summary.sh

smoke-input:
	./scripts/smoke-input.sh

smoke-complex:
	./scripts/smoke-complex.sh

demo-complex:
	./scripts/gen-complex-demo.sh

vet:
	$(GO) vet ./...

build:
	$(GO) build -o bin/studio-reporter .

# Cross-compile Windows CLI for Desktop win packs / Gauge plugin zips
build-windows:
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $(GO) build -o bin/studio-reporter.exe .

lint:
	$(GOLANGCI_LINT) run ./...

desktop-test:
	cd desktop && npm test

# Unpacked dir build (smoke). Requires: make build && cd desktop && npm install
desktop-pack: build
	cd desktop && npm run pack:dir

# Windows unpacked dir (cross-pack from Linux/mac). Requires studio-reporter.exe
desktop-pack-win: build-windows
	cd desktop && npm run pack:dir:win

# Full unpacked Desktop smoke: CLI build + electron-builder --dir + layout verify
desktop-pack-smoke:
	bash desktop/scripts/pack-smoke.sh

ci: check-assets vet test build

all: sync-assets ci
