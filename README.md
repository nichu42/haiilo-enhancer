# Haiilo Enhancer

[![Latest Release](https://img.shields.io/gitea/v/release/nichu42/haiilo-enhancer?gitea_url=https://codeberg.org&sort=semver&label=Latest+Release)](https://codeberg.org/nichu42/haiilo-enhancer/releases) [![License](https://img.shields.io/badge/license-AGPL--3.0-red.svg)](LICENSE)

A browser extension for a more peaceful Haiilo experience — mute users, expand the sidebar, customize the UI, and more.

Haiilo Enhancer adds small, local quality-of-life improvements directly in your browser. It does not send data to external services.

## ✨ Features

- **🔇 Mute users** — right-click any username to hide their posts and comments, temporarily or permanently.
- **🎨 Customize group chat avatars** — replace generic group icons with channel initials and configurable colors.
- **📂 Auto-expand sidebar lists** — automatically click Haiilo's "Show more" buttons for Workspaces and Pages on page load.
- **💬 Messenger controls** — keep the chat panel expanded and adjust its open width.
- **🕒 Date & time format** — switch from US to European or 24-hour if your Haiilo language is English.
- **🏠 Custom homepage** — set which page the Haiilo logo opens, per domain.
- **🛠️ Custom domains** — works on your organization's custom Haiilo URL, not just haiilo.app.
- **💾 Import / export / reset** — back up your muted users and all settings to a JSON file.

## 🚀 Quick start

1. Install the extension for your browser.
2. Open Haiilo.
3. Right-click a username to mute that user temporarily or permanently.
4. Open the extension popup to review muted users and use quick interface options.
5. Open **More Options** for custom domains, date/time format, sidebar behavior, avatar customization, backups, and advanced settings.

## 📥 Installation

### 🦊 Firefox

1. Download `haiilo-enhancer-firefox.xpi` from the [Releases page](https://codeberg.org/nichu42/haiilo-enhancer/releases).
2. Drag the file onto a Firefox window, or open `about:addons` and choose **Install Add-on From File…**.
3. Open Haiilo and use the toolbar popup or options page to configure the extension.

### 🌐 Chromium (Chrome, Vivaldi, Edge, Brave, etc.)

1. Download `haiilo-enhancer-chrome.zip` from the [Releases page](https://codeberg.org/nichu42/haiilo-enhancer/releases).
2. Unzip the archive.
3. Open your browser's extensions page, for example `chrome://extensions/`.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the unzipped folder.
6. Open Haiilo and use the toolbar popup or options page to configure the extension.

## 🔐 Permissions and privacy

Everything happens locally in your browser. Haiilo Enhancer stores all settings locally in your browser using extension storage. This includes muted users, display preferences, custom domains, and backup/restore data.
The extension does not send your Haiilo content, muted users, or settings to any external service.

## ⚠️ Known limitations

- Haiilo is a dynamic web application, so UI selectors can occasionally change after Haiilo updates. Please [report any issues](https://codeberg.org/nichu42/haiilo-enhancer/issues) if you encounter problems.
- Custom domains require explicit browser permission before the extension can run on them.
- In Chromium-based browsers, optional host permissions may remain visible in the browser's extension settings even after removing a custom domain from the extension. To remove them, you may need to remove and re-install the extension.

## 💬 Issues & Community

Found a bug or have a feature idea? [Open an issue on Codeberg](https://codeberg.org/nichu42/haiilo-enhancer/issues). Contributions are welcome.

If you find this extension useful:

[![Donate using Liberapay](https://liberapay.com/assets/widgets/donate.svg)](https://liberapay.com/nichu42/donate) [![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/nichu42)

## ⚠️ Disclaimer

This is an independent, open-source project not affiliated with, endorsed by, or in any way officially connected with Haiilo GmbH or any of its subsidiaries or affiliates. The name Haiilo and related marks are registered trademarks of their respective owners.

## 📄 Warranty & License

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [GNU Affero General Public License](LICENSE) for more details.

---

## 🛠️ Development

### Build

```sh
# Windows
.\build.ps1            # both browsers
.\build.ps1 -Firefox
.\build.ps1 -Chrome

# macOS / Linux
./build.sh             # both browsers
./build.sh -Firefox
./build.sh -Chrome
```

Packages are written to `dist/`. The Windows script may need `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` once.

### Load from source

- **Chromium-based**: open `chrome://extensions/`, enable Developer mode, **Load unpacked** the project root.
- **Firefox**: build first, then **Load Temporary Add-on…** in `about:debugging` and pick `dist/firefox/manifest.json`.
