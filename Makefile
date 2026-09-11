.PHONY: test vet build lint sync-assets check-assets cover ci all

GO ?= go
GOTOOLCHAIN ?= go1.27.0
GOLANGCI_LINT ?= golangci-lint

export GOTOOLCHAIN

sync-assets:
	./scripts/sync-assets.sh

check-assets:
	./scripts/check-assets.sh

test:
	$(GO) test ./...

cover:
	./scripts/cover-summary.sh

vet:
	$(GO) vet ./...

build:
	$(GO) build -o bin/studio-reporter .

lint:
	$(GOLANGCI_LINT) run ./...

ci: check-assets vet test build

all: sync-assets ci
