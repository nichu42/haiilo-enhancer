# Build script for Haiilo Enhancer
# Creates distribution packages for Chrome and Firefox

param(
    [switch]$Chrome,
    [switch]$Firefox,
    [switch]$All
)

$distDir = "dist"

# Create dist directory
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir | Out-Null
}

function Build-Chrome {
    Write-Host "Building Chrome extension..." -ForegroundColor Cyan

    $chromeDir = "$distDir\chrome"
    if (Test-Path $chromeDir) {
        Remove-Item -Recurse -Force $chromeDir
    }
    New-Item -ItemType Directory -Path $chromeDir | Out-Null

    # Copy files
    $files = @(
        "manifest.json",
        "background.js",
        "content.js",
        "content.css",
        "popup.html",
        "popup.css",
        "popup.js",
        "options.html",
        "options.css",
        "options.js",
        "colors.css"
    )

    foreach ($file in $files) {
        Copy-Item $file $chromeDir
    }

    # Copy icons
    Copy-Item -Recurse "icons" "$chromeDir\icons"
    Remove-Item "$chromeDir\icons\*.ps1" -ErrorAction SilentlyContinue
    Remove-Item "$chromeDir\icons\*.html" -ErrorAction SilentlyContinue

    # Create zip
    $zipPath = "$distDir\haiilo-enhancer-chrome.zip"
    if (Test-Path $zipPath) {
        Remove-Item $zipPath
    }
    Compress-Archive -Path "$chromeDir\*" -DestinationPath $zipPath

    Write-Host "Chrome build complete: $zipPath" -ForegroundColor Green
}

function Build-Firefox {
    Write-Host "Building Firefox extension..." -ForegroundColor Cyan

    $firefoxDir = "$distDir\firefox"
    if (Test-Path $firefoxDir) {
        Remove-Item -Recurse -Force $firefoxDir
    }
    New-Item -ItemType Directory -Path $firefoxDir | Out-Null

    # Copy files (Firefox uses different manifest but same background.js)
    Copy-Item "manifest.firefox.json" "$firefoxDir\manifest.json"

    $files = @(
        "LICENSE",
        "background.js",
        "content.js",
        "content.css",
        "popup.html",
        "popup.css",
        "popup.js",
        "options.html",
        "options.css",
        "options.js",
        "colors.css"
    )

    foreach ($file in $files) {
        Copy-Item $file $firefoxDir
    }

    # Copy icons
    Copy-Item -Recurse "icons" "$firefoxDir\icons"
    Remove-Item "$firefoxDir\icons\*.ps1" -ErrorAction SilentlyContinue
    Remove-Item "$firefoxDir\icons\*.html" -ErrorAction SilentlyContinue

    # Create xpi (same format as zip; Firefox recognises the .xpi extension natively)
    $zipPath = "$distDir\haiilo-enhancer-firefox.zip"
    $xpiPath = "$distDir\haiilo-enhancer-firefox.xpi"
    if (Test-Path $zipPath) {
        Remove-Item $zipPath
    }
    if (Test-Path $xpiPath) {
        Remove-Item $xpiPath
    }
    Compress-Archive -Path "$firefoxDir\*" -DestinationPath $zipPath
    Rename-Item -Path $zipPath -NewName "haiilo-enhancer-firefox.xpi"

    Write-Host "Firefox build complete: $xpiPath" -ForegroundColor Green
}

# Determine what to build
if ($All -or (-not $Chrome -and -not $Firefox)) {
    Build-Chrome
    Build-Firefox
} else {
    if ($Chrome) { Build-Chrome }
    if ($Firefox) { Build-Firefox }
}

Write-Host ""
Write-Host "Build complete! Check the '$distDir' folder." -ForegroundColor Yellow
