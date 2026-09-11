.PHONY: test vet build all ci

GO ?= go
GOTOOLCHAIN ?= go1.27.0

export GOTOOLCHAIN

test:
	$(GO) test ./...

vet:
	$(GO) vet ./...

build:
	$(GO) build -o bin/studio-reporter .

ci: vet test build

all: ci
	./build-all.sh
