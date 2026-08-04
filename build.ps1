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

function Compress-ToZip {
    param(
        [string]$SourcePath,
        [string]$ZipPath
    )
    
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    if (Test-Path $ZipPath) { Remove-Item $ZipPath }
    
    $zip = [System.IO.Compression.ZipFile]::Open($ZipPath, 'Update')
    Get-ChildItem -Path $SourcePath -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
        $entryName = $_.FullName.Substring((Get-Item $SourcePath).FullName.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName)
    }
    $zip.Dispose()
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
        "colors.css",
        "i18n.js",
        "shared.js",
        "legal.js",
        "LICENSE",
        "PRIVACY.md"
    )

    foreach ($file in $files) {
        Copy-Item $file $chromeDir
    }
    Copy-Item -Recurse "_locales" "$chromeDir\_locales"

    # Copy icons
    Copy-Item -Recurse "icons" "$chromeDir\icons"
    Remove-Item "$chromeDir\icons\*.ps1" -ErrorAction SilentlyContinue
    Remove-Item "$chromeDir\icons\*.html" -ErrorAction SilentlyContinue

    # Create zip
    $zipPath = "$distDir\haiilo-enhancer-chrome.zip"
    Compress-ToZip -SourcePath $chromeDir -ZipPath $zipPath

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
        "PRIVACY.md",
        "background.js",
        "content.js",
        "content.css",
        "popup.html",
        "popup.css",
        "popup.js",
        "options.html",
        "options.css",
        "options.js",
        "colors.css",
        "i18n.js",
        "shared.js",
        "legal.js"
    )

    foreach ($file in $files) {
        Copy-Item $file $firefoxDir
    }
    Copy-Item -Recurse "_locales" "$firefoxDir\_locales"

    # Copy icons
    Copy-Item -Recurse "icons" "$firefoxDir\icons"
    Remove-Item "$firefoxDir\icons\*.ps1" -ErrorAction SilentlyContinue
    Remove-Item "$firefoxDir\icons\*.html" -ErrorAction SilentlyContinue

    # Create xpi (same format as zip; Firefox recognises the .xpi extension natively)
    $xpiPath = "$distDir\haiilo-enhancer-firefox.xpi"
    Compress-ToZip -SourcePath $firefoxDir -ZipPath $xpiPath

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
