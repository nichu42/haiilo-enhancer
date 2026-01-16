# Hush for Haiilo

A browser extension that lets you mute users on Haiilo - hiding their posts and comments from your view.

## Features

- **Right-click to mute**: Right-click on any username to add them to your mute list
- **Flexible mute durations**: Mute permanently or for 1, 3, 7, 14, 30, or 90 days
- **Easy management**: View and manage muted users from the popup
- **Auto-expiry**: Temporary mutes automatically expire
- **Import/Export**: Backup and restore your mute list
- **Badge counter**: See how many items are hidden on the current page

## Installation

### Chrome / Edge / Brave (Chromium browsers)

1. Download or clone this repository
2. Open your browser and go to `chrome://extensions/` (or `edge://extensions/` for Edge)
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the `hush-for-haiilo` folder
6. The extension icon should appear in your toolbar

### Firefox

1. Download or clone this repository
2. Rename `manifest.firefox.json` to `manifest.json` (backup the original first)
3. Rename `background-firefox.js` to `background.js` (backup the original first)
4. Open Firefox and go to `about:debugging#/runtime/this-firefox`
5. Click "Load Temporary Add-on"
6. Select the `manifest.json` file from the `hush-for-haiilo` folder

For permanent Firefox installation, the extension needs to be signed by Mozilla.

## Usage

### Muting a User

1. **Right-click method**:
   - Select a username or right-click on a user link on Haiilo
   - Choose "Hush for Haiilo" from the context menu
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
- Import/Export functionality

## File Structure

```
hush-for-haiilo/
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
- Only runs on Haiilo websites (`*.haiilo.app` and `*.haiilo.com`)
- Stores muted users list locally in your browser
- Does not send any data to external servers
- Does not track your usage

## License

MIT License - Feel free to modify and distribute.

## Credits

Inspired by a Tampermonkey script by Mistral Le Chat.
