# Build a Gauge-installable zip for one platform (Windows).
# Usage: .\build.ps1 [platform] [arch] [version]
# Zip layout: plugin.json + bin/studio-reporter[.exe]

param(
    [string]$Platform = "windows",
    [string]$Arch = "amd64",
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if ([string]::IsNullOrWhiteSpace($Version)) {
    $plugin = Get-Content -Raw -Path "plugin.json" | ConvertFrom-Json
    $Version = $plugin.version
}

$archLabel = switch ($Arch) {
    "amd64" { "x86_64" }
    "386" { "x86" }
    default { $Arch }
}

$binName = if ($Platform -eq "windows") { "studio-reporter.exe" } else { "studio-reporter" }

Write-Host "Building studio-reporter $Version for $Platform/$Arch ($archLabel)..." -ForegroundColor Green

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("studio-reporter-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path (Join-Path $stage "bin") | Out-Null
if (-not (Test-Path "dist")) {
    New-Item -ItemType Directory -Path "dist" | Out-Null
}

try {
    $env:CGO_ENABLED = "0"
    $env:GOOS = $Platform
    $env:GOARCH = $Arch
    go build -trimpath -ldflags="-s -w" -o (Join-Path $stage "bin\$binName") .
    Copy-Item "plugin.json" -Destination $stage

    $zipName = "studio-reporter-$Version-$Platform.$archLabel.zip"
    $zipPath = Join-Path $Root "dist\$zipName"
    if (Test-Path $zipPath) {
        Remove-Item -Force $zipPath
    }
    Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -Force
    Write-Host "Build complete: dist\$zipName" -ForegroundColor Green
}
finally {
    if (Test-Path $stage) {
        Remove-Item -Recurse -Force $stage
    }
}
