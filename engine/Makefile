.PHONY: build test lint

build:
	go build -o bin/athene-engine ./cmd/athene-engine

test:
	go test ./...

lint:
	go vet ./...
