// Options page script for Haiilo Enhancer
//# sourceURL=haiilo-enhancer/options.js

// Browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const DATE_TIME_PRESETS = {
  northAmerican12h: { dateFormat: 'MM/DD/YYYY', timeFormat: '12h', label: 'MM/DD/YYYY (North American)' },
  westernEuropean12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h', label: 'DD/MM/YYYY (Western European)' },
  westernEuropean24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', label: 'DD/MM/YYYY (Western European)' },
  centralEuropean24h: { dateFormat: 'DD.MM.YYYY', timeFormat: '24h', label: 'DD.MM.YYYY (Central European)' },
  dutch24h: { dateFormat: 'DD-MM-YYYY', timeFormat: '24h', label: 'DD-MM-YYYY (Dutch)' },
  iso860124h: { dateFormat: 'YYYY-MM-DD', timeFormat: '24h', label: 'YYYY-MM-DD (ISO 8601)' },
  eastAsian12h: { dateFormat: 'YYYY/MM/DD', timeFormat: '12h', label: 'YYYY/MM/DD (East Asian)' },
  eastAsian24h: { dateFormat: 'YYYY/MM/DD', timeFormat: '24h', label: 'YYYY/MM/DD (East Asian)' },
  hungarian24h: { dateFormat: 'YYYY. MM. DD.', timeFormat: '24h', label: 'YYYY. MM. DD. (Hungarian)' },
  finnish24h: { dateFormat: 'D.M.YYYY', timeFormat: '24h', label: 'D.M.YYYY (Finnish)' },
  spacedCentral24h: { dateFormat: 'D. M. YYYY', timeFormat: '24h', label: 'D. M. YYYY (Central European)' },
  dottedSlavic24h: { dateFormat: 'D.M.YYYY.', timeFormat: '24h', label: 'D.M.YYYY. (Central European)' },
  spacedSlavic24h: { dateFormat: 'D. M. YYYY.', timeFormat: '24h', label: 'D. M. YYYY. (Central European)' },
  korean24h: { dateFormat: 'YYYY. M. D.', timeFormat: '24h', label: 'YYYY. M. D. (Korean)' },
  southAsian12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h', label: 'DD/MM/YYYY (South Asian)' },
  southAsian24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', label: 'DD/MM/YYYY (South Asian)' },
  latinAmerican12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h', label: 'DD/MM/YYYY (Latin American)' },
  latinAmerican24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', label: 'DD/MM/YYYY (Latin American)' },
  middleEastern24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', label: 'DD/MM/YYYY (Middle Eastern)' },
  southeastAsian12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h', label: 'DD/MM/YYYY (Southeast Asian)' },
  southeastAsian24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', label: 'DD/MM/YYYY (Southeast Asian)' }
};

function normalizeDateFormatValue(value) {
  const aliasMap = {
    MMDD: 'northAmerican12h',
    DDMM: 'westernEuropean24h',
    'DD.MM': 'centralEuropean24h',
    'DD-MM': 'dutch24h',
    westernEuropean12h: 'westernEuropean24h',
    eastAsian12h: 'eastAsian24h',
    southAsian24h: 'southAsian12h',
    latinAmerican12h: 'latinAmerican24h',
    southeastAsian12h: 'southeastAsian24h'
  };
  if (DATE_TIME_PRESETS[value]) return value;
  return aliasMap[value] || 'northAmerican12h';
}

function getPresetForDateFormat(value) {
  return DATE_TIME_PRESETS[normalizeDateFormatValue(value)] || DATE_TIME_PRESETS.northAmerican12h;
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

function updateCloudSyncWarning(settings) {
  const warning = document.getElementById('cloudSyncWarning');
  if (!warning) return;
  // Show the warning if cloudSync was disabled externally (i.e. user limit exceeded)
  // We detect this by checking if the checkbox is unchecked but the stored value was true
  // The background sets cloudSync = false when limit exceeded and broadcasts settingsUpdated.
  // The warning is shown only when explicitly triggered via cloudSyncDisabled message.
  warning.style.display = 'none';
}

// Listen for cloudSyncDisabled broadcast from background
browserAPI.runtime.onMessage.addListener((message) => {
  if (message.action === 'cloudSyncDisabled') {
    const warning = document.getElementById('cloudSyncWarning');
    if (warning) warning.style.display = 'block';
    const cloudSyncCheckbox = document.getElementById('cloudSync');
    if (cloudSyncCheckbox) cloudSyncCheckbox.checked = false;
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOptions);
} else {
  initOptions();
}

async function initOptions() {
  // Display version from manifest
  const manifest = browserAPI.runtime.getManifest();
  document.getElementById('versionInfo').textContent = `v${manifest.version}`;
  document.getElementById('footerVersion').textContent = `Haiilo Enhancer v${manifest.version}`;

  // Show Chrome-specific warning only on Chrome/Edge
  const isChrome = typeof browser === 'undefined';
  const warningElement = document.getElementById('chromePermissionWarning');
  if (warningElement) {
    warningElement.style.display = isChrome ? 'block' : 'none';
  }

  await loadSettings();
  await loadDomains();
  await loadCustomHomepages();
  setupEventListeners();
}

async function loadSettings() {
  const settings = await browserAPI.runtime.sendMessage({ action: 'getSettings' });

  const extensionEnabledInput = document.getElementById('extensionEnabled');
  if (extensionEnabledInput) {
    extensionEnabledInput.checked = settings.extensionEnabled !== false;
  }

  document.getElementById('defaultMuteDays').value = settings.defaultMuteDays || 7;
  document.getElementById('showMutedIndicator').checked = settings.showMutedIndicator !== false;
  document.getElementById('debugMode').checked = settings.debugMode || false;
  const normalizedDateFormat = normalizeDateFormatValue(settings.dateFormat || 'northAmerican12h');
  document.getElementById('dateFormat').value = normalizedDateFormat;
  document.getElementById('timeFormat').value = settings.timeFormat || getPresetForDateFormat(normalizedDateFormat).timeFormat;
  document.getElementById('enhanceChannelAvatars').checked = settings.enhanceChannelAvatars !== false;
  document.getElementById('channelAvatarStyle').value = settings.channelAvatarStyle || 'ring';

  // Ring settings
  document.getElementById('channelAvatarRingColor').value = settings.channelAvatarRingColor || '#502379';
  document.getElementById('channelAvatarRingWidth').value = settings.channelAvatarRingWidth !== undefined ? settings.channelAvatarRingWidth : 2;

  // Square settings
  document.getElementById('channelAvatarSquareColor').value = settings.channelAvatarSquareColor || '#502379';
  document.getElementById('channelAvatarSquareWidth').value = settings.channelAvatarSquareWidth !== undefined ? settings.channelAvatarSquareWidth : 2;

  // Badge settings
  document.getElementById('channelAvatarBadgeSize').value = settings.channelAvatarBadgeSize || 100;
  document.getElementById('badgeSizeValue').textContent = (settings.channelAvatarBadgeSize || 100) + '%';
  document.getElementById('channelAvatarBadgePosition').value = settings.channelAvatarBadgePosition || 'bottom-left';

  // Color mode settings
  const colorMode = settings.channelAvatarColorMode || 'random';
  document.getElementById('colorModeRandom').checked = colorMode === 'random';
  document.getElementById('colorModeFixed').checked = colorMode === 'fixed';
  document.getElementById('channelAvatarFixedColor').value = settings.channelAvatarFixedColor || '#0f939d';

  // Auto-expand sidebar lists
  document.getElementById('autoExpandEnabled').checked = settings.autoExpandEnabled === true;
  document.getElementById('autoExpandClicksPerList').value = settings.autoExpandClicksPerList !== undefined ? settings.autoExpandClicksPerList : 3;
  document.getElementById('autoExpandDelayMs').value = settings.autoExpandDelayMs !== undefined ? settings.autoExpandDelayMs : 300;
  const scope = settings.autoExpandScope;
  document.getElementById('autoExpandScope').value = (scope === 'workspaces' || scope === 'pages') ? scope : 'both';

  // Cloud sync
  const cloudSyncCheckbox = document.getElementById('cloudSync');
  if (cloudSyncCheckbox) {
    cloudSyncCheckbox.checked = settings.cloudSync === true;
    // Show warning if sync was previously enabled but muted list now exceeds limit
    const mutedUsers = await browserAPI.runtime.sendMessage({ action: 'getMutedUsers' });
    const warning = document.getElementById('cloudSyncWarning');
    if (warning && !settings.cloudSync && Array.isArray(mutedUsers) && mutedUsers.length > 50) {
      warning.style.display = 'block';
    }
    updateCloudSyncWarning(settings);
  }

  // Show/hide channel avatar settings based on checkbox
  toggleChannelAvatarSettings();
  toggleStyleSettings();

  // Generate random initials and color for preview
  generateRandomPreview();
  updatePreview(false); // Don't regenerate color - use the one from generateRandomPreview
  
  updatePageDisabledState();
}

async function loadDomains() {
  const response = await browserAPI.runtime.sendMessage({ action: 'getCustomDomains' });
  const domains = response || [];

  const domainsList = document.getElementById('domainsList');
  domainsList.textContent = '';

  if (domains.length === 0) {
    const emptyEl = document.createElement('p');
    emptyEl.className = 'empty-state';
    emptyEl.textContent = 'No custom domains added. Default: *.haiilo.app and *.haiilo.com';
    domainsList.appendChild(emptyEl);
    return;
  }

  domains.forEach(domain => {
    const div = document.createElement('div');
    div.className = 'domain-item';

    const span = document.createElement('span');
    span.className = 'domain-item-text';
    span.textContent = domain;

    const btn = document.createElement('button');
    btn.className = 'danger remove-domain-btn';
    btn.dataset.domain = domain;
    btn.textContent = 'Remove';

    div.appendChild(span);
    div.appendChild(btn);
    domainsList.appendChild(div);
  });
}

async function loadCustomHomepages() {
  const customHomepages = await browserAPI.runtime.sendMessage({ action: 'getCustomHomepages' });
  const homepagesList = document.getElementById('homepagesList');
  homepagesList.textContent = '';

  const entries = Object.entries(customHomepages || {});

  if (entries.length === 0) {
    const emptyEl = document.createElement('p');
    emptyEl.className = 'empty-state';
    emptyEl.textContent = 'No custom homepages set. Use the context menu on a homepage tab to set one.';
    homepagesList.appendChild(emptyEl);
    return;
  }

  entries.forEach(([baseUrl, homepageUrl]) => {
    let displayPath = homepageUrl;
    let displayName = '';

    try {
      const url = new URL(homepageUrl);
      displayPath = url.pathname;

      if (displayPath.startsWith('/home/')) {
        const section = displayPath.substring(6);
        if (section === 'members') {
          displayName = 'Home';
        } else if (section === 'timeline') {
          displayName = 'Home (soft)';
        } else {
          displayName = 'Home (' + section.charAt(0).toUpperCase() + section.slice(1) + ')';
        }
      } else if (displayPath.startsWith('/pages/')) {
        displayName = 'Pages';
      } else if (displayPath.startsWith('/workspaces/')) {
        displayName = 'Workspaces';
      } else {
        displayName = displayPath;
      }
    } catch (e) {
      displayName = homepageUrl;
      displayPath = homepageUrl;
    }

    const div = document.createElement('div');
    div.className = 'domain-item';

    const textContainer = document.createElement('div');
    textContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'domain-item-text';
    nameSpan.style.fontWeight = '500';
    nameSpan.textContent = baseUrl;

    const descSpan = document.createElement('span');
    descSpan.className = 'domain-item-text';
    descSpan.style.cssText = 'font-size: 0.9em; opacity: 0.7;';
    descSpan.textContent = displayName + ' [' + displayPath + ']';

    const btn = document.createElement('button');
    btn.className = 'danger remove-homepage-btn';
    btn.dataset.baseurl = baseUrl;
    btn.textContent = 'Remove';

    textContainer.appendChild(nameSpan);
    textContainer.appendChild(descSpan);
    div.appendChild(textContainer);
    div.appendChild(btn);
    homepagesList.appendChild(div);
  });
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setupEventListeners() {
  // Auto-save on change
  const extensionEnabledInput = document.getElementById('extensionEnabled');
  if (extensionEnabledInput) {
    extensionEnabledInput.addEventListener('change', () => {
      updatePageDisabledState();
      saveSettings();
    });
  }
  document.getElementById('defaultMuteDays').addEventListener('change', saveSettings);
  document.getElementById('showMutedIndicator').addEventListener('change', saveSettings);
  document.getElementById('debugMode').addEventListener('change', saveSettings);
  document.getElementById('dateFormat').addEventListener('change', () => {
    const dateFormatSelect = document.getElementById('dateFormat');
    const timeFormatSelect = document.getElementById('timeFormat');
    const preset = getPresetForDateFormat(dateFormatSelect.value);
    if (timeFormatSelect) {
      timeFormatSelect.value = preset.timeFormat;
    }
    saveSettings();
  });
  document.getElementById('timeFormat').addEventListener('change', saveSettings);

  document.getElementById('enhanceChannelAvatars').addEventListener('change', () => {
    toggleChannelAvatarSettings();
    saveSettings();
  });

  document.getElementById('channelAvatarStyle').addEventListener('change', () => {
    toggleStyleSettings();
    updatePreview(false);
    saveSettings();
  });

  // Ring settings
  document.getElementById('channelAvatarRingColor').addEventListener('input', () => {
    updatePreview(false);
    saveSettings();
  });
  document.getElementById('channelAvatarRingWidth').addEventListener('input', () => {
    updatePreview(false);
    saveSettings();
  });

  // Square settings
  document.getElementById('channelAvatarSquareColor').addEventListener('input', () => {
    updatePreview(false);
    saveSettings();
  });
  document.getElementById('channelAvatarSquareWidth').addEventListener('input', () => {
    updatePreview(false);
    saveSettings();
  });

  // Badge settings
  document.getElementById('channelAvatarBadgeSize').addEventListener('input', (e) => {
    document.getElementById('badgeSizeValue').textContent = e.target.value + '%';
    updatePreview(false);
    saveSettings();
  });

  document.getElementById('channelAvatarBadgePosition').addEventListener('change', () => {
    updatePreview(false);
    saveSettings();
  });

  // Color mode settings
  document.getElementById('colorModeRandom').addEventListener('change', () => {
    updatePreview(true);
    saveSettings();
  });

  document.getElementById('colorModeFixed').addEventListener('change', () => {
    updatePreview(true);
    saveSettings();
  });

  document.getElementById('channelAvatarFixedColor').addEventListener('input', () => {
    updatePreview(true);
    saveSettings();
  });

  // Auto-expand settings
  document.getElementById('autoExpandEnabled').addEventListener('change', saveSettings);
  document.getElementById('autoExpandScope').addEventListener('change', saveSettings);

  // Cloud sync toggle
  const cloudSyncCheckbox = document.getElementById('cloudSync');
  if (cloudSyncCheckbox) {
    cloudSyncCheckbox.addEventListener('change', async (e) => {
      if (e.target.checked) {
        // Test whether storage.sync is actually available before enabling
        try {
          await browserAPI.storage.sync.set({ __haiiloSyncTest: true });
          await browserAPI.storage.sync.remove('__haiiloSyncTest');
        } catch (err) {
          // Sync not available — revert the checkbox and warn the user
          e.target.checked = false;
          showStatus('Cloud sync is not available. Make sure you are signed into your browser account.', 'error');
          return;
        }
      }
      saveSettings();
    });
  }
  document.getElementById('autoExpandClicksPerList').addEventListener('change', () => {
    // Clamp the value client-side as a safety net.
    const input = document.getElementById('autoExpandClicksPerList');
    let v = parseInt(input.value, 10);
    if (isNaN(v)) v = 3;
    v = Math.max(0, Math.min(10, v));
    input.value = v;
    saveSettings();
  });
  document.getElementById('autoExpandDelayMs').addEventListener('change', () => {
    const input = document.getElementById('autoExpandDelayMs');
    let v = parseInt(input.value, 10);
    if (isNaN(v)) v = 300;
    v = Math.max(100, Math.min(1000, v));
    input.value = v;
    saveSettings();
  });

  // Reset buttons
  document.getElementById('resetRing').addEventListener('click', resetRingSettings);
  document.getElementById('resetSquare').addEventListener('click', resetSquareSettings);
  document.getElementById('resetBadge').addEventListener('click', resetBadgeSettings);
  document.getElementById('applyLocaleDefaults').addEventListener('click', applyLocaleDefaults);

  // Custom domains
  document.getElementById('addDomain').addEventListener('click', addDomain);
  document.getElementById('newDomain').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDomain();
    }
  });

  // Remove domain - using event delegation since buttons are dynamically created
  document.getElementById('domainsList').addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove-domain-btn')) {
      const domain = e.target.getAttribute('data-domain');
      if (domain) {
        await removeDomain(domain);
      }
    }
  });

  // Remove custom homepage - using event delegation
  document.getElementById('homepagesList').addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove-homepage-btn')) {
      const baseUrl = e.target.getAttribute('data-baseurl');
      if (baseUrl) {
        await removeCustomHomepage(baseUrl);
      }
    }
  });

  // Export data
  document.getElementById('exportData').addEventListener('click', exportData);

  // Import data
  document.getElementById('importData').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', importData);

  // Clear all
  document.getElementById('clearAll').addEventListener('click', clearAllData);
}

async function addDomain() {
  const input = document.getElementById('newDomain');
  let domain = input.value.trim();

  if (!domain) return;

  // Clean up the domain (remove protocol, path, etc.)
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/\/.*$/, '');
  domain = domain.toLowerCase();

  // Basic validation
  if (!domain.includes('.')) {
    showStatus('Please enter a valid domain name', 'error');
    return;
  }

  try {
    // Check if domain already exists
    const existingDomains = await browserAPI.runtime.sendMessage({ action: 'getCustomDomains' });
    if (existingDomains && existingDomains.includes(domain)) {
      showStatus('Domain already exists', 'error');
      return;
    }

    // Request permission directly from user gesture (must be done in options page, not background)
    const granted = await browserAPI.permissions.request({
      origins: [
        `https://*.${domain}/*`,
        `https://${domain}/*`,
        `http://*.${domain}/*`,
        `http://${domain}/*`
      ]
    });

    if (!granted) {
      showStatus('Permission denied. You must grant access to this domain.', 'error');
      return;
    }

    // Now add the domain to storage via background script
    const response = await browserAPI.runtime.sendMessage({ action: 'addCustomDomain', domain });
    if (response && response.success) {
      input.value = '';
      await loadDomains();
      showStatus('Domain added successfully', 'success');
    } else {
      const errorMsg = response && response.error ? response.error : 'Failed to add domain';
      showStatus(errorMsg, 'error');
      console.error('Error adding domain:', errorMsg);
    }
  } catch (error) {
    showStatus('Error adding domain: ' + error.message, 'error');
    console.error('Error adding domain:', error);
  }
}

async function removeDomain(domain) {
  try {
    // Remove from storage first via background script
    await browserAPI.runtime.sendMessage({ action: 'removeCustomDomain', domain });

    // Then attempt to remove permissions
    const permissionsToRemove = {
      origins: [
        `https://*.${domain}/*`,
        `https://${domain}/*`,
        `http://*.${domain}/*`,
        `http://${domain}/*`
      ]
    };

    // Check if we have these permissions before removing
    const hasPermissions = await browserAPI.permissions.contains(permissionsToRemove);
    debugLog(`Domain ${domain} has permissions:`, hasPermissions);

    if (hasPermissions) {
      const removed = await browserAPI.permissions.remove(permissionsToRemove);
      debugLog(`Attempted to remove permissions for ${domain}, result:`, removed);

      // Chrome may report success but not actually remove the permission (known limitation)
      // Inform user they may need to manually revoke
      await loadDomains();
      showStatus('Domain removed. If permissions persist, manually revoke via chrome://extensions', 'success');
      return;
    }

    await loadDomains();
    showStatus('Domain removed successfully', 'success');
  } catch (error) {
    console.error('Error removing domain:', error);
    showStatus('Error removing domain: ' + error.message, 'error');
  }
}

async function removeCustomHomepage(baseUrl) {
  try {
    await browserAPI.runtime.sendMessage({ action: 'removeCustomHomepage', baseUrl });
    await loadCustomHomepages();
    showStatus('Custom homepage removed successfully', 'success');
  } catch (error) {
    console.error('Error removing custom homepage:', error);
    showStatus('Error removing custom homepage: ' + error.message, 'error');
  }
}

function toggleChannelAvatarSettings() {
  const enhanceEnabled = document.getElementById('enhanceChannelAvatars').checked;
  const optionsContainer = document.getElementById('channelAvatarOptions');
  optionsContainer.style.display = enhanceEnabled ? 'block' : 'none';
}

function toggleStyleSettings() {
  const style = document.getElementById('channelAvatarStyle').value;
  document.getElementById('ringColorSettings').style.display = style === 'ring' ? 'block' : 'none';
  document.getElementById('squareColorSettings').style.display = style === 'square' ? 'block' : 'none';
  document.getElementById('badgeSizeSettings').style.display = style === 'badge' ? 'block' : 'none';
  document.getElementById('badgePositionSettings').style.display = style === 'badge' ? 'block' : 'none';
}

async function saveSettings() {
  const colorMode = document.getElementById('colorModeRandom').checked ? 'random' : 'fixed';
  const normalizedDateFormat = normalizeDateFormatValue(document.getElementById('dateFormat').value);

  const settings = {
    extensionEnabled: document.getElementById('extensionEnabled').checked,
    defaultMuteDays: parseInt(document.getElementById('defaultMuteDays').value, 10),
    showMutedIndicator: document.getElementById('showMutedIndicator').checked,
    debugMode: document.getElementById('debugMode').checked,
    dateFormat: normalizedDateFormat,
    timeFormat: document.getElementById('timeFormat').value,
    enhanceChannelAvatars: document.getElementById('enhanceChannelAvatars').checked,
    channelAvatarStyle: document.getElementById('channelAvatarStyle').value,
    channelAvatarRingColor: document.getElementById('channelAvatarRingColor').value,
    channelAvatarRingWidth: parseFloat(document.getElementById('channelAvatarRingWidth').value),
    channelAvatarSquareColor: document.getElementById('channelAvatarSquareColor').value,
    channelAvatarSquareWidth: parseFloat(document.getElementById('channelAvatarSquareWidth').value),
    channelAvatarBadgeSize: parseInt(document.getElementById('channelAvatarBadgeSize').value, 10),
    channelAvatarBadgePosition: document.getElementById('channelAvatarBadgePosition').value,
    channelAvatarColorMode: colorMode,
    channelAvatarFixedColor: document.getElementById('channelAvatarFixedColor').value,
    autoExpandEnabled: document.getElementById('autoExpandEnabled').checked,
    autoExpandClicksPerList: parseInt(document.getElementById('autoExpandClicksPerList').value, 10) || 3,
    autoExpandDelayMs: parseInt(document.getElementById('autoExpandDelayMs').value, 10) || 300,
    autoExpandScope: document.getElementById('autoExpandScope').value,
    cloudSync: document.getElementById('cloudSync') ? document.getElementById('cloudSync').checked : false
  };

  await browserAPI.runtime.sendMessage({ action: 'saveSettings', settings });

  // Broadcast to all Haiilo tabs so the auto-expand runner picks up the
  // new values without a full page reload.
  try {
    const tabs = await browserAPI.tabs.query({});
    for (const tab of tabs) {
      if (tab && tab.url && /haiilo\.(app|com)/.test(tab.url)) {
        browserAPI.tabs.sendMessage(tab.id, { action: 'settingsUpdated' }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('Failed to broadcast settingsUpdated:', e);
  }

  showStatus('Settings saved', 'success');
}

async function applyLocaleDefaults() {
  try {
    const locale = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    const response = await browserAPI.runtime.sendMessage({ action: 'applyLocaleDefaults', locale });
    if (response && response.success) {
      await loadSettings();
      showStatus('Locale defaults applied', 'success');
      return;
    }
    showStatus('Could not apply locale defaults', 'error');
  } catch (error) {
    console.error('Error applying locale defaults:', error);
    showStatus('Error applying locale defaults: ' + error.message, 'error');
  }
}

async function exportData() {
  const mutedUsers = await browserAPI.runtime.sendMessage({ action: 'getMutedUsers' });
  const settings = await browserAPI.runtime.sendMessage({ action: 'getSettings' });
  const customDomains = await browserAPI.runtime.sendMessage({ action: 'getCustomDomains' });
  const customHomepages = await browserAPI.runtime.sendMessage({ action: 'getCustomHomepages' });

  const exportObj = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    mutedUsers,
    settings,
    customDomains: customDomains || [],
    customHomepages: customHomepages || {}
  };

  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `haiilo-enhancer-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();

  URL.revokeObjectURL(url);
  showStatus('All settings exported successfully', 'success');
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate file has required data
    if (!data.mutedUsers && !data.settings) {
      throw new Error('Invalid file format - must contain mutedUsers and/or settings');
    }

    // Import muted users
    let userCount = 0;
    if (data.mutedUsers && Array.isArray(data.mutedUsers)) {
      for (const user of data.mutedUsers) {
        await browserAPI.runtime.sendMessage({
          action: 'muteUser',
          userName: user.name,
          days: user.permanent ? null : Math.ceil((user.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))
        });
        userCount++;
      }
    }

    // Import all settings if present
    if (data.settings) {
      await browserAPI.runtime.sendMessage({ action: 'saveSettings', settings: data.settings });
      await loadSettings();
    }

    // Custom domains are intentionally NOT restored — browser host permissions
    // require a user gesture (click) and cannot be granted silently during import.
    // Show a warning banner listing the domains the user must re-add manually.
    const domainReauthWarning = document.getElementById('domainReauthWarning');
    const domainReauthList = document.getElementById('domainReauthList');
    if (data.customDomains && Array.isArray(data.customDomains) && data.customDomains.length > 0 && domainReauthWarning && domainReauthList) {
      domainReauthList.textContent = '';
      data.customDomains.forEach(domain => {
        const li = document.createElement('li');
        li.textContent = domain;
        domainReauthList.appendChild(li);
      });
      domainReauthWarning.style.display = 'block';
    } else if (domainReauthWarning) {
      domainReauthWarning.style.display = 'none';
    }

    // Import custom homepages if present
    if (data.customHomepages && typeof data.customHomepages === 'object') {
      for (const [baseUrl, homepageUrl] of Object.entries(data.customHomepages)) {
        await browserAPI.runtime.sendMessage({ action: 'setCustomHomepage', baseUrl, homepageUrl });
      }
      await loadCustomHomepages();
    }

    const messages = [];
    if (userCount > 0) messages.push(`${userCount} muted users`);
    if (data.settings) messages.push('all settings');
    if (data.customDomains && data.customDomains.length > 0) messages.push(`${data.customDomains.length} custom domain(s) need manual re-authorization (see warning above)`);
    if (data.customHomepages && Object.keys(data.customHomepages).length > 0) messages.push(`${Object.keys(data.customHomepages).length} custom homepage(s)`);

    showStatus(`Imported ${messages.join(' and ')}`, 'success');
  } catch (err) {
    showStatus('Failed to import data: ' + err.message, 'error');
  }

  // Reset file input
  e.target.value = '';
}

async function clearAllData() {
  if (!confirm('Are you sure you want to reset everything to defaults? This cannot be undone.')) {
    return;
  }

  const mutedUsers = await browserAPI.runtime.sendMessage({ action: 'getMutedUsers' });

  for (const user of mutedUsers) {
    await browserAPI.runtime.sendMessage({ action: 'unmuteUser', userName: user.name });
  }

  // Reset all settings to defaults
  await browserAPI.runtime.sendMessage({ action: 'resetSettings' });
  await loadSettings();

  showStatus('All settings have been reset to defaults', 'success');
}

function showStatus(message, type) {
  const status = document.getElementById('saveStatus');
  status.textContent = message;
  status.className = `save-status visible ${type}`;

  setTimeout(() => {
    status.classList.remove('visible');
  }, 3000);
}

// Generate random preview
function generateRandomPreview() {
  // Generate random two-letter initials
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const initials = letters[Math.floor(Math.random() * letters.length)] +
                   letters[Math.floor(Math.random() * letters.length)];
  document.getElementById('previewInitials').textContent = initials;

  // Update preview color based on color mode
  updatePreviewColor();
}

function updatePreviewColor() {
  const colorMode = document.getElementById('colorModeRandom').checked ? 'random' : 'fixed';
  const previewAvatar = document.getElementById('previewAvatar');

  if (colorMode === 'random') {
    // Generate random color
    const hue = Math.floor(Math.random() * 360);
    const color = `hsl(${hue}, 70%, 60%)`;
    previewAvatar.style.backgroundColor = color;
  } else {
    // Use fixed color
    const fixedColor = document.getElementById('channelAvatarFixedColor').value;
    previewAvatar.style.backgroundColor = fixedColor;
  }
}

// Preview and reset functions
function updatePreview(shouldUpdateColor = false) {
  const previewAvatar = document.getElementById('previewAvatar');
  const style = document.getElementById('channelAvatarStyle').value;

  // Only update preview color when explicitly requested (not when changing ring/square settings)
  if (shouldUpdateColor) {
    updatePreviewColor();
  }

  // Remove existing badges
  const existingBadge = previewAvatar.querySelector('.preview-badge');
  if (existingBadge) existingBadge.remove();

  // Convert hex color to rgba
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  switch (style) {
    case 'ring':
      const ringColor = document.getElementById('channelAvatarRingColor').value;
      const ringWidth = parseFloat(document.getElementById('channelAvatarRingWidth').value);
      previewAvatar.style.boxShadow = `0 0 0 ${ringWidth}px ${ringColor}`;
      previewAvatar.style.borderRadius = '50%';
      break;

    case 'square':
      const squareColor = document.getElementById('channelAvatarSquareColor').value;
      const squareWidth = parseFloat(document.getElementById('channelAvatarSquareWidth').value);
      previewAvatar.style.borderRadius = '20%';
      previewAvatar.style.boxShadow = `0 0 0 ${squareWidth}px ${squareColor}`;
      break;

    case 'badge':
      const badgeSizePercent = parseInt(document.getElementById('channelAvatarBadgeSize').value, 10);
      const badgePosition = document.getElementById('channelAvatarBadgePosition').value;
      // Base badge size is 17px at 100% (120% of old 14px size)
      const badgeSize = Math.round(17 * (badgeSizePercent / 100));
      previewAvatar.style.boxShadow = 'none';
      previewAvatar.style.borderRadius = '50%';

      // Determine position CSS
      const positionCSS = badgePosition === 'top-left'
        ? 'top: -2px; left: -2px;'
        : 'bottom: -2px; left: -2px;';

      // Create badge
      const badge = document.createElement('div');
      badge.className = 'preview-badge';
      badge.style.cssText = `
        position: absolute;
        ${positionCSS}
        width: ${badgeSize}px;
        height: ${badgeSize}px;
        background-color: #502379;
        border-radius: 50%;
        border: 2px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        const svgSize = Math.floor(badgeSize * 0.6);
        svg.setAttribute('width', svgSize);
        svg.setAttribute('height', svgSize);
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'white');
        svg.style.display = 'block';

        const c1 = document.createElementNS(svgNS, 'circle');
        c1.setAttribute('cx', '8');
        c1.setAttribute('cy', '8');
        c1.setAttribute('r', '4');

        const c2 = document.createElementNS(svgNS, 'circle');
        c2.setAttribute('cx', '16');
        c2.setAttribute('cy', '8');
        c2.setAttribute('r', '4');

        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('d', 'M12 14c-3 0-5 1.5-5 3v1h10v-1c0-1.5-2-3-5-3z');

        svg.appendChild(c1);
        svg.appendChild(c2);
        svg.appendChild(p);
        badge.appendChild(svg);
      }

      previewAvatar.appendChild(badge);
      break;
  }
}

function resetRingSettings() {
  document.getElementById('channelAvatarRingColor').value = '#502379';
  document.getElementById('channelAvatarRingWidth').value = 2;
  updatePreview(false);
  saveSettings();
  showStatus('Ring settings reset to default', 'success');
}

function resetSquareSettings() {
  document.getElementById('channelAvatarSquareColor').value = '#502379';
  document.getElementById('channelAvatarSquareWidth').value = 2;
  updatePreview(false);
  saveSettings();
  showStatus('Square settings reset to default', 'success');
}

function resetBadgeSettings() {
  document.getElementById('channelAvatarBadgeSize').value = 100;
  document.getElementById('badgeSizeValue').textContent = '100%';
  updatePreview(false);
  saveSettings();
  showStatus('Badge settings reset to default', 'success');
}

function updatePageDisabledState() {
  const isEnabledCheckbox = document.getElementById('extensionEnabled');
  if (!isEnabledCheckbox) return;
  const isEnabled = isEnabledCheckbox.checked;
  const sections = document.querySelectorAll('section:not(.extension-toggle-section)');
  sections.forEach(sec => {
    if (isEnabled) {
      sec.classList.remove('section-disabled');
    } else {
      sec.classList.add('section-disabled');
    }
  });
}
