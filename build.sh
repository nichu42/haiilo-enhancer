#!/bin/bash

# Build script for Haiilo Enhancer for macOS and Linux
# Creates distribution packages for Chrome and Firefox

# Stop on errors
set -e

DIST_DIR="dist"

# Create dist directory
mkdir -p "$DIST_DIR"

build_chrome() {
    echo "Building Chrome extension..."
    CHROME_DIR="$DIST_DIR/chrome"
    rm -rf "$CHROME_DIR"
    mkdir -p "$CHROME_DIR"

    # Copy files
    cp manifest.json background.js content.js content.css popup.html popup.css popup.js options.html options.css options.js colors.css "$CHROME_DIR"

    # Copy icons
    cp -r icons "$CHROME_DIR/icons"
    rm -f "$CHROME_DIR/icons"/*.ps1
    rm -f "$CHROME_DIR/icons"/*.html
    rm -f "$CHROME_DIR/icons"/*.svg

    # Create zip
    (cd "$CHROME_DIR" && zip -r "../haiilo-enhancer-chrome.zip" .)

    echo "Chrome build complete: $DIST_DIR/haiilo-enhancer-chrome.zip"
}

build_firefox() {
    echo "Building Firefox extension..."
    FIREFOX_DIR="$DIST_DIR/firefox"
    rm -rf "$FIREFOX_DIR"
    mkdir -p "$FIREFOX_DIR"

    # Copy files (Firefox uses different manifest)
    cp manifest.firefox.json "$FIREFOX_DIR/manifest.json"
    cp background.js content.js content.css popup.html popup.css popup.js options.html options.css options.js colors.css "$FIREFOX_DIR"

    # Copy icons
    cp -r icons "$FIREFOX_DIR/icons"
    rm -f "$FIREFOX_DIR/icons"/*.ps1
    rm -f "$FIREFOX_DIR/icons"/*.html
    rm -f "$FIREFOX_DIR/icons"/*.svg

    # Create xpi for local development (release builds are signed via web-ext sign)
    (cd "$FIREFOX_DIR" && zip -r "../haiilo-enhancer-firefox.xpi" .)

    echo "Firefox build complete: $DIST_DIR/haiilo-enhancer-firefox.xpi"
}

# Simple argument parsing
if [[ "$1" == "-Chrome" ]]; then
    build_chrome
elif [[ "$1" == "-Firefox" ]]; then
    build_firefox
else
    build_chrome
    build_firefox
fi

echo ""
echo "Build complete! Check the '$DIST_DIR' folder."
