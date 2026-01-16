# Haiilo Enhancer

A browser extension that enhances your Haiilo experience with user muting, custom domain support, and more features to come.

## Features

- **User Muting**: Hide posts and comments from specific users
- **Right-click to mute**: Right-click on any username to add them to your mute list
- **Flexible mute durations**: Mute permanently or for 1, 3, 7, 14, 30, or 90 days
- **Easy management**: View and manage muted users from the popup
- **Auto-expiry**: Temporary mutes automatically expire
- **Custom domains**: Support for organizations using custom Haiilo domains
- **Multiple domains**: Add multiple Haiilo instances if you're a user on several platforms
- **Import/Export**: Backup and restore your mute list
- **Badge counter**: See how many items are hidden on the current page

## Installation

### Chrome / Edge / Brave (Chromium browsers)

1. Download or clone this repository
2. Open your browser and go to `chrome://extensions/` (or `edge://extensions/` for Edge)
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the `haiilo-enhancer` folder
6. The extension icon should appear in your toolbar

### Firefox

1. Download or clone this repository
2. Rename `manifest.firefox.json` to `manifest.json` (backup the original first)
3. Rename `background-firefox.js` to `background.js` (backup the original first)
4. Open Firefox and go to `about:debugging#/runtime/this-firefox`
5. Click "Load Temporary Add-on"
6. Select the `manifest.json` file from the `haiilo-enhancer` folder

For permanent Firefox installation, the extension needs to be signed by Mozilla.

## Usage

### Setting Up Custom Domains

If your organization uses a custom domain for Haiilo (instead of *.haiilo.app):

1. Click the extension icon
2. Click "Settings"
3. Scroll to "Custom Haiilo Domains"
4. Enter your domain (e.g., `intranet.company.com`)
5. Click "Add Domain"

The extension will now work on this custom domain in addition to the default haiilo.app and haiilo.com domains.

### Muting a User

1. **Right-click method**:
   - Select a username or right-click on a user link on Haiilo
   - Choose "Haiilo Enhancer" from the context menu
   - Select the mute duration

2. **Manual method**:
   - Click the extension icon
   - Enter the username in the "Add User Manually" section
   - Select the duration and click "Mute"

### Unmuting a User

1. Click the extension icon
2. Find the user in the list
3. Click "Unmute"

### Settings

Click "Settings" in the popup to access:
- Default mute duration (for the "Mute for default period" option)
- Display options
- Custom domain management
- Import/Export functionality

## File Structure

```
haiilo-enhancer/
├── manifest.json           # Chrome/Edge manifest (Manifest V3)
├── manifest.firefox.json   # Firefox manifest (Manifest V2)
├── background.js           # Background service worker (Chrome)
├── background-firefox.js   # Background script (Firefox)
├── content.js              # Content script for filtering
├── content.css             # Styles for hidden content
├── popup.html              # Extension popup
├── popup.css               # Popup styles
├── popup.js                # Popup logic
├── options.html            # Settings page
├── options.css             # Settings styles
├── options.js              # Settings logic
└── icons/                  # Extension icons
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Privacy

This extension:
- Only runs on Haiilo websites (default domains and your custom domains)
- Stores muted users list and settings locally in your browser
- Does not send any data to external servers
- Does not track your usage

## Roadmap

Future enhancements may include:
- Keyword filtering
- Custom feed ordering
- Enhanced notifications
- More customization options

## License

MIT License - Feel free to modify and distribute.

## Credits

Inspired by a Tampermonkey script by Mistral Le Chat.
