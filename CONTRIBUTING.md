# Contributing to Haiilo Enhancer

First off, thank you for taking the time to contribute! 🎉

This document provides guidelines and instructions for contributing to **Haiilo Enhancer**. Following these guidelines helps ensure a smooth process for everyone involved and keeps the extension fast, secure, and compatible across all supported platforms.

---

## 📋 Code of Conduct

By participating in this project, you agree to maintain a respectful, welcoming, and collaborative environment.

---

## 🛠️ Getting Started & Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (for running hooks and linters)
- A Chromium-based browser (Chrome, Edge, Brave, etc.) and/or Firefox

### Local Setup
1. Clone this repository.
2. Install the Git pre-commit hooks to automatically check your code style and logs before committing:
   ```bash
   sh scripts/install-hooks.sh
   ```

### Running the Build
The build scripts compile browser packages and write them to the `dist/` directory.

- **On Windows (PowerShell):**
  ```powershell
  .\build.ps1            # Build for both Chrome and Firefox
  .\build.ps1 -Firefox   # Build Firefox package only
  .\build.ps1 -Chrome    # Build Chrome package only
  ```
  *Note: If you run into script execution issues, you may need to run `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` in PowerShell once.*

- **On macOS / Linux (Bash):**
  ```bash
  ./build.sh             # Build for both Chrome and Firefox
  ./build.sh -Firefox    # Build Firefox package only
  ./build.sh -Chrome     # Build Chrome package only
  ```

### Loading the Extension in Your Browser

- **Chromium-based browsers (Chrome, Edge, etc.):**
  1. Open the Extensions management page (e.g., `chrome://extensions/`).
  2. Enable **Developer mode** in the top-right corner.
  3. Click **Load unpacked** in the top-left corner.
  4. Select the project root folder.

- **Firefox:**
  1. Run the build command above to generate the Firefox distribution package.
  2. Open the Firefox debugging page (`about:debugging`).
  3. Click **This Firefox** on the left menu.
  4. Click **Load Temporary Add-on...** under Temporary Extensions.
  5. Select the `dist/firefox/manifest.json` file.

---

## ⚠️ Mandatory Architecture Constraints

To maintain compatibility and prevent regressions, all contributions **must** adhere to the following rules:

### 1. 100% Cross-Browser Compatibility
The extension must run seamlessly on both Chromium (Chrome Manifest V3) and Firefox (Firefox Manifest V2). 
- All browser API calls must route through the compatibility wrappers defined at the top of the JS files:
  ```javascript
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
  const badgeAPI   = typeof browser !== 'undefined' ? browser.browserAction : chrome.action;
  ```
- **Never** hardcode `chrome.*` directly for API calls. Doing so can cause silent failures (returning `undefined` instead of Promises) on Firefox.
- Keep the `manifest.json` (Chrome) and `manifest.firefox.json` (Firefox) synced. Do not hardcode version numbers in popup or options HTML files; they are dynamically injected at runtime.

### 2. Strict Log Linting (`debugLog`)
To keep the browser developer console clean in production:
- Do not use `console.log`, `console.warn`, `console.info`, or `console.debug` directly.
- Wrap all informational logs inside a function named `debugLog()` (which respects the user's debug mode setting).
- `console.error` is the only method allowed unconditionally for genuine error reports.
- You can manually run the log linter via:
  ```bash
  node scripts/lint-console.mjs
  ```

### 3. Storage Initialization
If you introduce a new settings key or storage attribute in `browserAPI.storage.local`:
- You **must** list this key in the initial `browserAPI.storage.local.get([...])` call inside the `onInstalled` listener in [background.js](file:///C:/bin/haiilo-enhancer/background.js).
- Failing to list the key will cause it to resolve as `undefined` on updates, triggering the initialization check and wiping the user's saved data.

### 4. Extension Context Safety & Exception Handling
- **Double Injection Guard**: Firefox may inject `content.js` multiple times. Keep the double-injection guard at the top of [content.js](file:///C:/bin/haiilo-enhancer/content.js) intact:
  ```javascript
  if (window.__haiiloEnhancerLoaded) return;
  window.__haiiloEnhancerLoaded = true;
  ```
- **Orphaned Scripts**: Check that the extension context is active before calling browser APIs inside async event handlers or observers using the `isExtensionContextValid()` helper. Wrap API accesses in a `try...catch` block where appropriate.
- **Exception-Safe URLs**: Always wrap `new URL()` operations in `try...catch` blocks to prevent malformed or special URLs (e.g. `about:blank`, relative links) from throwing unhandled exceptions and crashing the main extension execution flow.

### 5. Keeping Messenger Expanded (If modifying styling/UI overlays)
When targeting Angular backdrops or overlay dialogs:
- Angular overlay backdrops do not have standard CSS classes; they are created with inline styles. Always target them using the attribute selector:
  ```css
  div[style*="position: fixed"][style*="background: rgba"][style*="width: 100%"]
  ```
- Avoid registering capture-phase click listeners on the `document` level to keep the messenger expanded, as it blocks normal page interaction. Use MutationObservers to monitor classes and state instead.

### 6. Themes & Colors
- All colors are configured in [colors.css](file:///C:/bin/haiilo-enhancer/colors.css) using CSS Custom Properties (variables).
- Avoid writing ad-hoc colors or inline color styles. Update `colors.css` if custom styling needs to be adjusted.

---

## 🚀 How to Submit a Pull Request

1. **Format & Quality Check**: Ensure there are no console log violations or syntax errors. Make sure your pre-commit hooks have run successfully.
2. **Cross-Browser Verification**: Manually test your changes in both Chrome (or a Chromium-based browser) and Firefox.
3. **Commit Messages**: Write clear, descriptive commit messages.
4. **Push & PR**: Open a Pull Request on GitHub. Detail the changes you've made, why you made them, and how you tested them. Reference any related issues.
