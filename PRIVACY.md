# Privacy Policy — Haiilo Enhancer

This Privacy Policy informs you about the nature, scope, and purpose of the processing of personal data within the **Haiilo Enhancer** browser extension.

## 1. Core Principle: No Data Collection & No Transmission
The **Haiilo Enhancer** browser extension is designed with a privacy-first approach.
- **No personal data is collected, stored, tracked, or transmitted to external servers.**
- There are no analytics tools (tracking), no advertising partners, and no connections to third-party servers.
- All data processing occurs strictly locally in your browser on your device.

## 2. Local Storage of Configuration Data
To function as intended, certain preferences and configuration data are saved locally using your browser's extension storage (`chrome.storage.local` / `browser.storage.local`). This includes:
- Your settings and preferences (e.g., default mute duration, sidebar expand options, custom homepage, avatar styling).
- The list of users you have muted (usernames, mute timestamps, and expiration dates).
- Custom domains you manually added to run the extension on.

This data never leaves your device. You can view, export, or delete this data at any time via the extension's options page.

## 3. Permissions Explained
The extension requests only the minimum permissions necessary for its local functionality:
- **`storage`**: To save your preferences and mute lists on your device.
- **`contextMenus`**: To show the "Mute user" option in the browser's right-click context menu.
- **`activeTab` & `scripting`**: To read the username to mute on the active page and dynamically apply the hiding logic (`content.js`/`content.css`).
- **`tabs`**: To instantly synchronize settings across all open Haiilo tabs without reloading.
- **`webNavigation`**: To detect when a Haiilo page loads so that muted posts can be hidden instantly on page load.
- **Host Permissions** (`*.haiilo.app`, `*.haiilo.com`): To allow the extension to run on official Haiilo platforms.

## 4. Contact & Support
Haiilo Enhancer is an open-source project. You can inspect the source code, report bugs, or contact the maintainers at:
https://codeberg.org/nichu42/haiilo-enhancer
