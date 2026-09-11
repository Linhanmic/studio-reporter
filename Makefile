.PHONY: test vet build lint sync-assets check-assets cover hooks smoke-input smoke-complex demo-complex ci all

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

lint:
	$(GOLANGCI_LINT) run ./...

ci: check-assets vet test build

all: sync-assets ci
