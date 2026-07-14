## Description

Briefly describe the changes introduced by this Pull Request.

## Motivation & Context

What problem does this solve, or what feature does this add? If it relates to an open issue, link it here (e.g., `Closes #123`).

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Refactoring / Cleanup (non-breaking code quality improvements)
- [ ] Documentation update
- [ ] Other (please describe):

## Checklist

Please verify that your changes adhere to the extension's development constraints:

- [ ] **Cross-Browser Compatibility**: I have tested these changes on both a Chromium-based browser (Chrome, Edge, etc.) and Firefox.
- [ ] **API Wrappers**: I have used the correct `browserAPI` and `badgeAPI` references instead of hardcoded `chrome.*` or `browser.action.*` API calls.
- [ ] **No Direct Console Logs**: I have wrapped all debug/informational logs in the `debugLog` wrapper, and verify the pre-commit lint hooks pass without violations.
- [ ] **Storage Upgrades**: If introducing new settings or storage keys, I have added them to the initial `browserAPI.storage.local.get` list in the `onInstalled` listener in `background.js`.
- [ ] **Context & Exception Safety**: I have used context validity checks (`isExtensionContextValid()`) and wrapped potentially failing operations (like `new URL()`) in `try...catch` blocks.
- [ ] **UI Overlays**: If modifying the messenger sidebar features or other overlays, I have verified that modals (like search/reactions) and general page content click interactions remain fully functional.

## Screenshots / Visuals (if applicable)

Please add screenshots, screen recordings, or GIFs showing the changes, especially if they affect the popup, options page, or Haiilo UI.
