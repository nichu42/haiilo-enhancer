# Haiilo Enhancer

[![Latest Release](https://img.shields.io/gitea/v/release/nichu42/haiilo-enhancer?gitea_url=https://codeberg.org&sort=semver&label=Latest+Release)](https://codeberg.org/nichu42/haiilo-enhancer/releases) [![License](https://img.shields.io/badge/license-AGPL--3.0-red.svg)](LICENSE)

A browser extension that enhances your Haiilo experience — mute users, customize the UI, set a custom homepage, and more.

## ✨ Features

### 🔇 Content Filtering
- **User Muting**: Hide posts and comments from specific users for a more peaceful feed.
- **Right-Click to Mute**: Add users to your mute list directly from their posts or comments.
- **Flexible Mute Durations**: Mute permanently or for 1, 3, 7, 14, 30, or 90 days.
- **Hidden Content Counter**: The extension icon shows how many items are currently hidden on the page.

### 🎨 Interface Customization
- **Channel Avatar Customization**: Replace generic group chat icons with colorful, styled avatars.
- **Custom Homepage**: Set a custom landing page per Haiilo domain.
- **Date & Time Formatting**: Switch from US-style to European or 24-hour formats.
- **Keep Messenger Expanded**: Force the Haiilo messenger panel to stay open.

### ⚙️ Settings & Data
- **Custom Domain Support**: Works with your organization's custom Haiilo domain.
- **Import/Export**: Back up and restore your muted users and all settings to a JSON file.
- **Full Data Reset**: Wipe all settings and the mute list from the options page.

## 📥 Installation

### 🦊 Firefox

1. Go to the [Releases page](https://codeberg.org/nichu42/haiilo-enhancer/releases) and download `haiilo-enhancer-firefox.xpi`.
2. Drag the file onto any Firefox window — or open `about:addons` and choose **Install Add-on From File…**.

### 🌐 Chrome, Vivaldi, Brave, Edge, …

Chrome and other Chromium-based browsers require extensions to be loaded in developer mode for self-distributed installs.

1. Go to the [Releases page](https://codeberg.org/nichu42/haiilo-enhancer/releases) and download `haiilo-enhancer-chrome.zip`, then unzip it.
2. Open `chrome://extensions/` (or the equivalent in your browser).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the folder you just unzipped.

## 🖱️ Usage

### Muting a User

- **From the feed**: Right-click a user's name or profile link, choose **Haiilo Enhancer** from the context menu, and pick a mute duration.
- **Manually**: Click the extension icon in your toolbar, enter a username, select a duration, and click **Mute**.

### Managing Muted Users and Settings

- Click the extension icon to open the popup — view and unmute users from there.
- Click **Settings** inside the popup to configure all features.

## 🎛️ Advanced Customization

### Channel Avatar Customization

In settings, enable **Enhance Channel Avatars** to replace generic group chat icons with colorful avatars. You can customize:

- **Avatar Style**: Choose between a ring border, a rounded square, or a small badge overlay.
- **Colors**: Use a random color per channel or set a fixed color for all of them.
- **Fine-tuning**: Adjust the border width and color of the ring/square, or the size and position of the badge.

### Custom Homepage

1. Navigate to your preferred page in Haiilo.
2. Right-click the navigation link for that page.
3. Select **Haiilo Enhancer → Set as default homepage** from the context menu.

The Haiilo logo will now redirect to that page. You can manage your set homepages in Settings.

### Date & Time Formatting

In settings, change the display format for dates and times across Haiilo (e.g., DD.MM.YYYY with a 24-hour clock).

## 💬 Issues & Community

Found a bug or have a feature idea? [Open an issue on Codeberg](https://codeberg.org/nichu42/haiilo-enhancer/issues).

Contributions are always welcome — feel free to open an issue or submit a pull request.

If you find this extension useful, please consider supporting its development:

[![Donate using Liberapay](https://liberapay.com/assets/widgets/donate.svg)](https://liberapay.com/nichu42/donate) [![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/nichu42)

## ⚠️ Disclaimer

This is an independent, open-source project not affiliated with, endorsed by, or in any way officially connected with Haiilo GmbH or any of its subsidiaries or affiliates. The name Haiilo and related marks are registered trademarks of their respective owners.

## 📄 License

Licensed under the **GNU Affero General Public License v3.0 or later**. See the [LICENSE](LICENSE) file for details.

---

## 🛠️ Advanced

### Loading from Source (Development)

You can also run the extension straight from the repository. First, [download the repository](https://codeberg.org/nichu42/haiilo-enhancer/archive/main.zip) and unzip it, or clone it with Git.

#### Chromium-based browsers

No build step needed.

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the project root (the folder containing `manifest.json`).

#### Firefox

A build step is required for Firefox.

1. Follow the build instructions below.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`.

### Building the Extension

#### Windows

You may need to allow the script to run first:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then build from the project root:

| Target | Command |
|--------|---------|
| Both | `.\build.ps1` |
| Firefox | `.\build.ps1 -Firefox` |
| Chrome | `.\build.ps1 -Chrome` |

#### macOS / Linux

```bash
chmod +x build.sh
./build.sh          # both browsers
./build.sh -Firefox # Firefox only
./build.sh -Chrome  # Chrome only
```

Packages are written to the `dist/` folder.

