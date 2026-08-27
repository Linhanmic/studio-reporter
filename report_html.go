package main

import "embed"

//go:embed report.html
var reportHTMLTemplate string

//go:embed report-assets
var reportAssets embed.FS
