# Haiilo Enhancer

[![Latest Release](https://img.shields.io/gitea/v/release/nichu42/haiilo-enhancer?gitea_url=https://codeberg.org&sort=semver&label=Latest+Release)](https://codeberg.org/nichu42/haiilo-enhancer/releases) [![License](https://img.shields.io/badge/license-AGPL--3.0-red.svg)](LICENSE)

A browser extension for a more peaceful Haiilo experience — mute users, expand the sidebar, customize the UI, and more.

## ✨ Features

- **🔇 Mute users** — right-click any username to hide their posts and comments, temporarily or permanently.
- **📂 Auto-expand sidebar** — Haiilo hides most Workspaces and Pages behind a "Show more" button. This extension can auto-click it on page load.
- **🎨 Color the group chats** — replace Haiilo's generic group icon with the channel's initials, in a color you can tune.
- **🏠 Custom homepage** — set which page the Haiilo logo opens, per domain.
- **🕒 Date & time format** — switch from US to European or 24-hour, even when your Haiilo language is English.
- **💬 Keep messenger open** — prevents outside clicks from collapsing the chat panel.
- **🛠️ Custom domains** — works on your organization's custom Haiilo URL, not just haiilo.app.
- **💾 Import / export / reset** — back up your muted users and all settings to a JSON file.

## 📥 Installation

### 🦊 Firefox
Download `haiilo-enhancer-firefox.xpi` from the [Releases page](https://codeberg.org/nichu42/haiilo-enhancer/releases) and drag it onto any Firefox window (or use **Install Add-on From File…** in `about:addons`).

### 🌐 Chrome, Vivaldi, Brave, Edge, …
Download and unzip `haiilo-enhancer-chrome.zip` from the [Releases page](https://codeberg.org/nichu42/haiilo-enhancer/releases), then in `chrome://extensions/` enable **Developer mode** and **Load unpacked** the folder.

## 💬 Issues & Community

Found a bug or have a feature idea? [Open an issue on Codeberg](https://codeberg.org/nichu42/haiilo-enhancer/issues). Contributions are welcome.

If you find this extension useful:

[![Donate using Liberapay](https://liberapay.com/assets/widgets/donate.svg)](https://liberapay.com/nichu42/donate) [![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/nichu42)

## ⚠️ Disclaimer

This is an independent, open-source project not affiliated with, endorsed by, or in any way officially connected with Haiilo GmbH or any of its subsidiaries or affiliates. The name Haiilo and related marks are registered trademarks of their respective owners.

## 📄 License

GNU Affero General Public License v3.0 or later. See the [LICENSE](LICENSE) file for details.

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
