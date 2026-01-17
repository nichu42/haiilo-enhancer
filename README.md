# Haiilo Enhancer

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-AGPL--3.0-red.svg)

A browser extension that enhances your Haiilo experience with user muting, UI customizations, custom domain support, and more.

## Overview

Haiilo Enhancer is a browser extension designed to give you more control over your Haiilo feed and interface. It allows you to mute users, customize the look and feel of avatars and dates, set custom homepages, and keep the messenger panel open. It supports custom Haiilo domains for organizations and provides tools to manage your settings easily.

## Features

### Content Filtering
-   **User Muting**: Hide posts and comments from specific users to clean up your feed.
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

### Chrome / Edge / Brave (and other Chromium-based browsers)

1.  Download the latest release from the [releases page](https://codeberg.org/nichu42/haiilo-enhancer/releases) or clone this repository.
2.  Unzip the downloaded file.
3.  Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/` for Edge).
4.  Enable "Developer mode" using the toggle switch, usually found in the top-right corner.
5.  Click the "Load unpacked" button.
6.  Select the directory where you unzipped the files.
7.  The Haiilo Enhancer icon will appear in your browser's toolbar.

### Firefox

1.  Download the latest `firefox` release from the [releases page](https://codeberg.org/nichu42/haiilo-enhancer/releases).
2.  Open Firefox and navigate to `about:addons`.
3.  Click the gear icon and select "Install Add-on From File...".
4.  Select the downloaded `.xpi` file.

For development, you can load the add-on temporarily:

1.  Clone this repository.
2.  Rename `manifest.firefox.json` to `manifest.json`.
3.  Rename `background-firefox.js` to `background.js`.
4.  Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
5.  Click "Load Temporary Add-on...".
6.  Select the `manifest.json` file in the project directory.

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

## Support the Project

If you find this extension useful, please consider supporting its development.

[![Donate using Liberapay](https://liberapay.com/assets/widgets/donate.svg)](https://liberapay.com/nichu42/donate)

## Contributing

Contributions are welcome! If you have ideas for new features, bug fixes, or improvements, please feel free to open an issue or submit a pull request.

## License

This project is licensed under the **GNU Affero General Public License v3.0 or later**. See the [LICENSE](LICENSE) file for more details.