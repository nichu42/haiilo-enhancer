// Popup script for Haiilo Enhancer
//# sourceURL=haiilo-enhancer/popup.js

// Browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Debug logging helper - reads the debugMode flag from settings on each
// call so live toggles take effect without reload.
function debugLog(...args) {
  browserAPI.storage.local.get('settings').then(data => {
    const settings = data.settings || {};
    if (settings.debugMode) {
      console.log(...args);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Display version from manifest
  const manifest = browserAPI.runtime.getManifest();
  const versionEl = document.getElementById('versionInfo');
  if (versionEl) versionEl.textContent = `v${manifest.version}`;

  await loadMutedUsers();
  await loadHiddenCount();
  await loadSettings();
  setupEventListeners();
});

async function loadMutedUsers() {
  const response = await browserAPI.runtime.sendMessage({ action: 'getMutedUsers' });
  const mutedList = document.getElementById('mutedList');
  mutedList.textContent = '';

  if (!response || response.length === 0) {
    const emptyEl = document.createElement('p');
    emptyEl.className = 'empty-state';
    emptyEl.textContent = 'No muted users yet. Right-click on a username to mute.';
    mutedList.appendChild(emptyEl);
    return;
  }

  response.forEach(user => mutedList.appendChild(createUserElement(user)));

  // Add event listeners to unmute buttons
  mutedList.querySelectorAll('.unmute-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userName = e.target.dataset.user;
      await browserAPI.runtime.sendMessage({ action: 'unmuteUser', userName });
      await loadMutedUsers();
    });
  });
}

function createUserElement(user) {
  const div = document.createElement('div');
  div.className = 'muted-user';

  const infoDiv = document.createElement('div');
  infoDiv.className = 'muted-user-info';

  const nameDiv = document.createElement('div');
  nameDiv.className = 'muted-user-name';
  nameDiv.textContent = user.name;
  nameDiv.title = user.name;

  const expiryClass = user.permanent ? 'permanent' : '';
  const expiryDiv = document.createElement('div');
  expiryDiv.className = `muted-user-expiry ${expiryClass}`;
  expiryDiv.textContent = user.permanent ? 'Permanently muted' : `Expires ${formatExpiry(user.expiresAt)}`;

  infoDiv.appendChild(nameDiv);
  infoDiv.appendChild(expiryDiv);

  const btn = document.createElement('button');
  btn.className = 'unmute-btn';
  btn.dataset.user = user.name;
  btn.textContent = 'Unmute';

  div.appendChild(infoDiv);
  div.appendChild(btn);

  return div;
}

function formatExpiry(timestamp) {
  const now = Date.now();
  const diff = timestamp - now;

  if (diff < 0) return 'expired';

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  if (days > 0) {
    return `in ${days} day${days > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `in ${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    return 'soon';
  }
}

async function loadHiddenCount() {
  try {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (tab && (tab.url.includes('haiilo.app') || tab.url.includes('haiilo.com'))) {
      const response = await browserAPI.tabs.sendMessage(tab.id, { action: 'getHiddenCount' });
      if (response && typeof response.count === 'number') {
        document.getElementById('hiddenCount').textContent = response.count;
      }
    }
  } catch (e) {
    // Tab might not have content script loaded
    debugLog('Could not get hidden count:', e);
  }
}

async function loadSettings() {
  const settings = await browserAPI.runtime.sendMessage({ action: 'getSettings' });
  const messengerCheckbox = document.getElementById('keepMessengerExpanded');
  const layoutCheckbox = document.getElementById('adjustLayoutForMessenger');

  if (messengerCheckbox) {
    messengerCheckbox.checked = settings.keepMessengerExpanded || false;

    // Attach event listener immediately after setting the checkbox
    messengerCheckbox.addEventListener('change', async (e) => {
      try {
        debugLog('[Popup] Messenger expanded toggle changed to:', e.target.checked);
        const settings = await browserAPI.runtime.sendMessage({ action: 'getSettings' });
        settings.keepMessengerExpanded = e.target.checked;

        // Disable layout adjustment if messenger expansion is disabled
        if (!e.target.checked) {
          settings.adjustLayoutForMessenger = false;
          if (layoutCheckbox) {
            layoutCheckbox.checked = false;
            layoutCheckbox.disabled = true;
          }
        } else {
          // Enable the layout adjustment checkbox when messenger expansion is enabled
          if (layoutCheckbox) {
            layoutCheckbox.disabled = false;
          }
        }

        await browserAPI.runtime.sendMessage({ action: 'saveSettings', settings });
        debugLog('[Popup] Settings saved, keepMessengerExpanded:', e.target.checked);

        // Notify all tabs about the change
        const tabs = await browserAPI.tabs.query({});
        debugLog('[Popup] Found', tabs.length, 'total tabs');
        tabs.forEach(tab => {
          if (tab.url.includes('haiilo.app') || tab.url.includes('haiilo.com')) {
            debugLog('[Popup] Sending toggleMessengerExpanded message to tab:', tab.url, 'expanded:', e.target.checked);
            browserAPI.tabs.sendMessage(tab.id, {
              action: 'toggleMessengerExpanded',
              expanded: e.target.checked,
              adjustLayout: settings.adjustLayoutForMessenger
            }).catch((err) => {
              // Silently ignore errors for tabs where content script isn't loaded
              if (browserAPI.runtime.lastError) {
                // Clear the lastError
              }
            });
          }
        });
      } catch (error) {
        console.error('[Popup] Error in messenger expanded toggle:', error);
      }
    });
  }

  if (layoutCheckbox) {
    layoutCheckbox.checked = settings.adjustLayoutForMessenger || false;
    layoutCheckbox.disabled = !settings.keepMessengerExpanded;

    layoutCheckbox.addEventListener('change', async (e) => {
      try {
        debugLog('[Popup] Layout adjustment toggle changed to:', e.target.checked);
        const settings = await browserAPI.runtime.sendMessage({ action: 'getSettings' });
        settings.adjustLayoutForMessenger = e.target.checked;
        await browserAPI.runtime.sendMessage({ action: 'saveSettings', settings });
        debugLog('[Popup] Settings saved, adjustLayoutForMessenger:', e.target.checked);

        // Notify all tabs about the change
        const tabs = await browserAPI.tabs.query({});
        tabs.forEach(tab => {
          if (tab.url.includes('haiilo.app') || tab.url.includes('haiilo.com')) {
            debugLog('[Popup] Sending toggleMessengerExpanded message to tab:', tab.url, 'adjustLayout:', e.target.checked);
            browserAPI.tabs.sendMessage(tab.id, {
              action: 'toggleMessengerExpanded',
              expanded: settings.keepMessengerExpanded,
              adjustLayout: e.target.checked
            }).catch((err) => {
              // Silently ignore errors for tabs where content script isn't loaded
              if (browserAPI.runtime.lastError) {
                // Clear the lastError
              }
            });
          }
        });
      } catch (error) {
        console.error('[Popup] Error in layout adjustment toggle:', error);
      }
    });
  }
}

function setupEventListeners() {
  // Add user form
  document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userNameInput = document.getElementById('userName');
    const durationSelect = document.getElementById('muteDuration');

    const userName = userNameInput.value.trim();
    const duration = durationSelect.value;

    if (!userName) return;

    const days = duration === 'permanent' ? null : parseInt(duration, 10);

    await browserAPI.runtime.sendMessage({
      action: 'muteUser',
      userName,
      days
    });

    userNameInput.value = '';
    await loadMutedUsers();
  });

  // Open options
  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    browserAPI.runtime.openOptionsPage();
  });
}
