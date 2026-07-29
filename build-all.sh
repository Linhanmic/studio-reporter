#!/bin/bash

# Cross-platform build script for studio-reporter plugin
# Usage: ./build-all.sh [version]

set -e

VERSION=${1:-"0.1.0"}

echo "Building studio-reporter for all platforms..."

# Create dist directory
mkdir -p dist

# Build for Linux amd64
echo "Building for Linux amd64..."
rm -rf bin && mkdir -p bin
GOOS=linux GOARCH=amd64 go build -o bin/studio-reporter ./...
cp plugin.json bin/
cd bin && zip -r "../dist/studio-reporter-${VERSION}-linux.amd64.zip" . && cd ..
rm -rf bin

# Build for Linux arm64
echo "Building for Linux arm64..."
rm -rf bin && mkdir -p bin
GOOS=linux GOARCH=arm64 go build -o bin/studio-reporter ./...
cp plugin.json bin/
cd bin && zip -r "../dist/studio-reporter-${VERSION}-linux.arm64.zip" . && cd ..
rm -rf bin

# Build for macOS amd64
echo "Building for macOS amd64..."
rm -rf bin && mkdir -p bin
GOOS=darwin GOARCH=amd64 go build -o bin/studio-reporter ./...
cp plugin.json bin/
cd bin && zip -r "../dist/studio-reporter-${VERSION}-darwin.amd64.zip" . && cd ..
rm -rf bin

# Build for macOS arm64 (Apple Silicon)
echo "Building for macOS arm64..."
rm -rf bin && mkdir -p bin
GOOS=darwin GOARCH=arm64 go build -o bin/studio-reporter ./...
cp plugin.json bin/
cd bin && zip -r "../dist/studio-reporter-${VERSION}-darwin.arm64.zip" . && cd ..
rm -rf bin

# Build for Windows amd64
echo "Building for Windows amd64..."
rm -rf bin && mkdir -p bin
GOOS=windows GOARCH=amd64 go build -o bin/studio-reporter.exe ./...
cp plugin.json bin/
cd bin && zip -r "../dist/studio-reporter-${VERSION}-windows.amd64.zip" . && cd ..
rm -rf bin

# Build for Windows arm64
echo "Building for Windows arm64..."
rm -rf bin && mkdir -p bin
GOOS=windows GOARCH=arm64 go build -o bin/studio-reporter.exe ./...
cp plugin.json bin/
cd bin && zip -r "../dist/studio-reporter-${VERSION}-windows.arm64.zip" . && cd ..
rm -rf bin

echo "All builds complete!"
echo ""
echo "Distribution packages:"
ls -la dist/
