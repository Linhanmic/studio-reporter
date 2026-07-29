# Build script for studio-reporter plugin (Windows)
# Usage: .\build.ps1 [platform] [arch]

param(
    [string]$Platform = "windows",
    [string]$Arch = "amd64",
    [string]$Version = "0.1.0"
)

Write-Host "Building studio-reporter for $Platform/$Arch..." -ForegroundColor Green

# Create temp bin directory
if (Test-Path "bin") {
    Remove-Item -Recurse -Force "bin"
}
New-Item -ItemType Directory -Path "bin" | Out-Null

# Create dist directory
if (-not (Test-Path "dist")) {
    New-Item -ItemType Directory -Path "dist" | Out-Null
}

# Set environment variables
$env:GOOS = $Platform
$env:GOARCH = $Arch

# Build binary
if ($Platform -eq "windows") {
    go build -o bin\studio-reporter.exe ./...
} else {
    go build -o bin\studio-reporter ./...
}

# Copy plugin.json to bin
Copy-Item "plugin.json" -Destination "bin/"

# Create zip filename
$zipName = "studio-reporter-$Version-$Platform.$Arch.zip"
$zipPath = "dist\$zipName"

# Create zip file
Compress-Archive -Path "bin\*" -DestinationPath $zipPath -Force

# Clean up bin directory
Remove-Item -Recurse -Force "bin"

Write-Host "Build complete: $zipPath" -ForegroundColor Green
