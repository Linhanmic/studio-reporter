#!/bin/bash

# Build script for studio-reporter plugin
# Usage: ./build.sh [platform] [arch] [version]

set -e

PLATFORM=${1:-$(go env GOOS)}
ARCH=${2:-$(go env GOARCH)}
VERSION=${3:-"0.1.0"}

echo "Building studio-reporter for $PLATFORM/$ARCH..."

# Clean and create temp bin directory
rm -rf bin
mkdir -p bin

# Create dist directory
mkdir -p dist

# Build binary
GOOS=$PLATFORM GOARCH=$ARCH go build -o bin/studio-reporter ./...

# Copy plugin.json to bin
cp plugin.json bin/

# Create zip filename
ZIP_NAME="studio-reporter-${VERSION}-${PLATFORM}.${ARCH}.zip"
ZIP_PATH="dist/${ZIP_NAME}"

# Create zip file
cd bin
zip -r "../${ZIP_PATH}" .
cd ..

# Clean up bin directory
rm -rf bin

echo "Build complete: ${ZIP_PATH}"
