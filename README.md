# Haiilo Enhancer

![Version](https://img.shields.io/gitea/v/release/nichu42/haiilo-enhancer?gitea_url=https://codeberg.org&sort=semver&label=version)
![License](https://img.shields.io/badge/license-AGPL--3.0-red.svg)

A browser extension that enhances your Haiilo experience with user muting, UI customizations, custom domain support, and more.

## Overview

Haiilo Enhancer is a browser extension designed to give you more control over your Haiilo feed and interface. It allows you to mute users, customize the look and feel of avatars and dates, set custom homepages, and keep the messenger panel open. It supports custom Haiilo domains for organizations and provides tools to manage your settings easily.

## Features

### Content Filtering
-   **User Muting**: Hide posts and comments from specific users for a more peaceful experience.
-   **Right-Click to Mute**: Quickly add users to your mute list directly from their posts or comments.
-   **Flexible Mute Durations**: Mute users permanently or for a specific period (1, 3, 7, 14, 30, or 90 days).
-   **Hidden Content Counter**: The extension icon shows a badge with the number of items hidden on the current page.

### Interface & UI Customization
-   **Channel Avatar Customization**: Replace generic group chat icons with generated, styled avatars (initials, custom colors, different styles like rings or badges).
-   **Custom Homepage**: Set a custom homepage for when you click the logo, configurable per domain.
-   **Date & Time Formatting**: Override the default US-style date and time formats with European, German, or 24-hour formats.
-   **Keep Messenger Expanded**: Force the Haiilo messenger panel to stay open.

### Settings & Data Management
-   **Custom Domain Support**: Use the extension with your organization's custom Haiilo domain.
-   **Import/Export**: Backup and restore your muted user list and all extension settings to a JSON file.
-   **Full Data Reset**: A button in the options to reset all settings and clear the mute list.

## Installation

### Download from Releases

The easiest way to install is to grab a pre-built package from the [Releases page](https://codeberg.org/nichu42/haiilo-enhancer/releases).

#### Firefox

1.  Download `haiilo-enhancer-firefox.xpi`.
2.  Drag the file onto any Firefox window — or open `about:addons` and choose **Install Add-on From File…**.

#### Chromium-based browsers (Chrome, Brave, Edge, Vivaldi, …)

Chrome and other Chromium browsers do not allow installing self-distributed extensions directly; the extension must be loaded in developer mode.

1.  Download `haiilo-enhancer-chrome.zip` and unzip it.
2.  Go to `chrome://extensions/` (or the equivalent in your browser).
3.  Enable **Developer mode**.
4.  Click **Load unpacked** and select the folder you just unzipped.

### Loading from Source (Development)

You can also run the extension straight from the repository.

First, [download the repository](https://codeberg.org/nichu42/haiilo-enhancer/archive/main.zip) and unzip it, or clone it with Git.

#### Chromium-based browsers

No build step needed — load directly from the source folder.

1.  Go to `chrome://extensions/`.
2.  Enable **Developer mode**.
3.  Click **Load unpacked** and select the project's root directory (the one containing `manifest.json`).

#### Firefox

A build step is required to use the correct manifest file.

1.  Follow the build instructions below for your operating system.
2.  Go to `about:debugging#/runtime/this-firefox`.
3.  Click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`.

### Building the Extension

#### Windows

You may need to allow the script to run first:

```
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Then build from the project's root directory:

-   **Firefox:** `.\build.ps1 -Firefox`
-   **Chrome:** `.\build.ps1 -Chrome`
-   **Both:** `.\build.ps1`

#### macOS / Linux

```bash
chmod +x build.sh
./build.sh          # both browsers
./build.sh -Firefox # Firefox only
./build.sh -Chrome  # Chrome only
```

Packages are written to the `dist/` folder.

## Usage

### Muting a User

-   **From the Haiilo feed**: Right-click on a user's name or profile link, select "Haiilo Enhancer" from the context menu, and choose a mute duration.
-   **Manually**: Click the extension icon in your toolbar, enter a username, select a duration, and click "Mute".

### Managing Muted Users and Settings

-   Click the extension icon to open the popup. Here you can see a list of muted users and unmute them.
-   Click the **Settings** button inside the popup to configure all features.

### Advanced Usage and Customization

All advanced features can be configured from the **Settings** page.

#### Channel Avatar Customization
In the settings, you can enable "Enhance Channel Avatars" to replace the generic group chat icons with colorful avatars based on the channel's name. You can customize:
-   **Avatar Style**: Choose between a ring border, a rounded square, or a small badge overlay to distinguish group chats.
-   **Colors**: Use a random color for each channel or set a fixed color for all of them.
-   **Style-Specific Settings**: Customize the width and color of the ring/square border or the size and position of the badge.

#### Setting a Custom Homepage
If you prefer a specific page (like "Home (soft)" or a custom Page) as your default, you can set it for each Haiilo instance:
1.  Navigate to the desired homepage tab in Haiilo.
2.  Right-click on the tab (e.g., the "Home (soft)" link in the navigation bar).
3.  Select "Haiilo Enhancer" > "Set as default homepage" from the context menu.
The main Haiilo logo will now redirect to this page. You can manage your set homepages in the settings.

#### Date & Time Formatting
In the settings, you can change the display format for dates and times across Haiilo to match your preference (e.g., DD.MM.YYYY and 24-hour time).

## Issues, and Community

If you encounter any bugs or have ideas for new features, please [report them on Codeberg](https://codeberg.org/nichu42/haiilo-enhancer/issues).

For updates, questions, and general discussion, you can join our chatroom on Matrix: [#haiiloenhancer:blueplanet.social](https://matrix.to/#/#haiiloenhancer:blueplanet.social).

Contributions are always welcome! If you'd like to contribute, please feel free to open an issue or submit a pull request.

If you find this extension useful, please consider supporting its development.

[![Donate using Liberapay](https://liberapay.com/assets/widgets/donate.svg)](https://liberapay.com/nichu42/donate)

## Disclaimer

This is an independent, open-source project and is not affiliated with, endorsed by, or in any way officially connected with Haiilo GmbH or any of its subsidiaries or affiliates. The name Haiilo as well as related names, marks, emblems, and images are registered trademarks of their respective owners.

## License

This project is licensed under the **GNU Affero General Public License v3.0 or later**. See the [LICENSE](LICENSE) file for more details.