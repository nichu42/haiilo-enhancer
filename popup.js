// Popup script for Haiilo Enhancer
//# sourceURL=haiilo-enhancer/popup.js

// Browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const DEFAULT_DOMAINS = ['haiilo.app', 'haiilo.com'];
const MESSENGER_WIDTH_MIN = 50;
const MESSENGER_WIDTH_MAX = 125;
const MESSENGER_WIDTH_DEFAULT = 100;

function clampMessengerPanelWidthPercent(value) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return MESSENGER_WIDTH_DEFAULT;
  return Math.max(MESSENGER_WIDTH_MIN, Math.min(MESSENGER_WIDTH_MAX, parsed));
}

async function getHaiiloDomains() {
  const data = await browserAPI.storage.local.get('customDomains');
  return [...DEFAULT_DOMAINS, ...(data.customDomains || [])];
}

async function isHaiiloUrl(url) {
  if (!url) return false;

  try {
    const hostname = new URL(url).hostname;
    const domains = await getHaiiloDomains();
    return domains.some(domain => hostname === domain || hostname.endsWith('.' + domain));
  } catch (e) {
    return false;
  }
}

async function notifyMessengerSettingChanged(expanded, messengerPanelWidthPercent) {
  const tabs = await browserAPI.tabs.query({});

  for (const tab of tabs) {
    if (await isHaiiloUrl(tab.url)) {
      browserAPI.tabs.sendMessage(tab.id, {
        action: 'toggleMessengerExpanded',
        expanded,
        messengerPanelWidthPercent
      }).catch(() => {
        // Silently ignore tabs where the content script is not available.
      });
    }
  }
}

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPopup);
} else {
  initPopup();
}

async function initPopup() {
  // Display version from manifest
  const manifest = browserAPI.runtime.getManifest();
  const versionEl = document.getElementById('versionInfo');
  if (versionEl) versionEl.textContent = `v${manifest.version}`;

  await loadMutedUsers();
  await loadHiddenCount();
  await loadSettings();
  setupEventListeners();
}

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
    if (tab && await isHaiiloUrl(tab.url)) {
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
  const widthSlider = document.getElementById('messengerPanelWidthPercent');
  const widthValue = document.getElementById('messengerPanelWidthValue');

  let messengerPanelWidthPercent = clampMessengerPanelWidthPercent(settings.messengerPanelWidthPercent);

  const updateWidthLabel = (value) => {
    if (widthValue) {
      widthValue.textContent = `${clampMessengerPanelWidthPercent(value)}%`;
    }
  };

  const extensionEnabledToggle = document.getElementById('extensionEnabledToggle');
  if (extensionEnabledToggle) {
    extensionEnabledToggle.checked = settings.extensionEnabled !== false;
    
    extensionEnabledToggle.addEventListener('change', async (e) => {
      try {
        const currentSettings = await browserAPI.runtime.sendMessage({ action: 'getSettings' });
        currentSettings.extensionEnabled = e.target.checked;
        await browserAPI.runtime.sendMessage({ action: 'saveSettings', settings: currentSettings });
        updatePopupDisabledState();
      } catch (error) {
        console.error('[Popup] Error saving extension toggle:', error);
      }
    });
  }

  if (widthSlider) {
    widthSlider.value = messengerPanelWidthPercent;
    updateWidthLabel(messengerPanelWidthPercent);

    widthSlider.addEventListener('input', (e) => {
      updateWidthLabel(e.target.value);
    });

    widthSlider.addEventListener('change', async (e) => {
      try {
        messengerPanelWidthPercent = clampMessengerPanelWidthPercent(e.target.value);
        widthSlider.value = messengerPanelWidthPercent;
        updateWidthLabel(messengerPanelWidthPercent);

        const currentSettings = await browserAPI.runtime.sendMessage({ action: 'getSettings' });
        currentSettings.messengerPanelWidthPercent = messengerPanelWidthPercent;
        await browserAPI.runtime.sendMessage({ action: 'saveSettings', settings: currentSettings });
        debugLog('[Popup] Settings saved, messengerPanelWidthPercent:', messengerPanelWidthPercent);

        if (messengerCheckbox && messengerCheckbox.checked) {
          await notifyMessengerSettingChanged(true, messengerPanelWidthPercent);
        }
      } catch (error) {
        console.error('[Popup] Error saving messenger width:', error);
      }
    });
  }

  if (messengerCheckbox) {
    messengerCheckbox.checked = settings.keepMessengerExpanded || false;

    messengerCheckbox.addEventListener('change', async (e) => {
      try {
        debugLog('[Popup] Messenger expanded toggle changed to:', e.target.checked);
        const currentSettings = await browserAPI.runtime.sendMessage({ action: 'getSettings' });
        currentSettings.keepMessengerExpanded = e.target.checked;
        currentSettings.messengerPanelWidthPercent = messengerPanelWidthPercent;

        await browserAPI.runtime.sendMessage({ action: 'saveSettings', settings: currentSettings });
        debugLog('[Popup] Settings saved, keepMessengerExpanded:', e.target.checked);

        updateWidthControls();
        await notifyMessengerSettingChanged(e.target.checked, messengerPanelWidthPercent);
      } catch (error) {
        console.error('[Popup] Error in messenger expanded toggle:', error);
      }
    });
  }

  updatePopupDisabledState();
}

function updateWidthControls() {
  const isEnabledToggle = document.getElementById('extensionEnabledToggle');
  const isEnabled = isEnabledToggle ? isEnabledToggle.checked : true;
  const messengerCheckbox = document.getElementById('keepMessengerExpanded');
  const widthSlider = document.getElementById('messengerPanelWidthPercent');
  const messengerEnabled = messengerCheckbox ? messengerCheckbox.checked : false;

  if (widthSlider) {
    widthSlider.disabled = !isEnabled || !messengerEnabled;
    widthSlider.title = !isEnabled 
      ? 'Extension is disabled'
      : (messengerEnabled ? 'Adjust the open messenger panel width' : 'Enable keep messenger expanded first');
  }
}

function updatePopupDisabledState() {
  const isEnabledToggle = document.getElementById('extensionEnabledToggle');
  if (!isEnabledToggle) return;
  const isEnabled = isEnabledToggle.checked;
  if (isEnabled) {
    document.body.classList.remove('extension-disabled');
  } else {
    document.body.classList.add('extension-disabled');
  }
  
  // Disable / Enable form inputs
  const addUserInputs = document.querySelectorAll('#addUserForm input, #addUserForm select, #addUserForm button');
  addUserInputs.forEach(input => {
    input.disabled = !isEnabled;
  });
  
  const keepMessengerExpanded = document.getElementById('keepMessengerExpanded');
  if (keepMessengerExpanded) {
    keepMessengerExpanded.disabled = !isEnabled;
  }
  
  updateWidthControls();
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
