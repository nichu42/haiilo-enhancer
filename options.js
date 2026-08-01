// Options page script for Haiilo Enhancer
//# sourceURL=haiilo-enhancer/options.js

// Browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
const t = (key, substitutions) => i18nMessage(key, substitutions);
let saveSettingsTimeout = null;

// The stored theme preference ('system' | 'light' | 'dark'), tracked so the
// OS theme-change listener knows whether to re-resolve.
let currentThemePreference = 'system';

// Shared constants and helpers (single source of truth in shared.js)
const clampMessengerPanelWidthPercent = HaiiloShared.clampMessengerPanelWidthPercent;
const DATE_TIME_PRESETS = HaiiloShared.DATE_TIME_PRESETS;
const normalizeDateFormatValue = HaiiloShared.normalizeDateFormatValue;

function getPresetForDateFormat(value) {
  return DATE_TIME_PRESETS[normalizeDateFormatValue(value)] || DATE_TIME_PRESETS.northAmerican12h;
}

function setThemeControl(mode) {
  const group = document.getElementById('themeGroup');
  if (!group) return;
  group.querySelectorAll('.theme-segmented-btn').forEach(btn => {
    const isActive = btn.dataset.themeValue === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

function getThemeControlValue() {
  const group = document.getElementById('themeGroup');
  if (!group) return 'system';
  const active = group.querySelector('.theme-segmented-btn.active');
  return active ? active.dataset.themeValue : 'system';
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
  // Apply the saved theme before any async work so the page doesn't flash
  // its light palette while i18n catalogs load.
  try {
    const data = await browserAPI.storage.local.get('settings');
    currentThemePreference = HaiiloShared.resolveThemeMode(data.settings && data.settings.theme);
    HaiiloShared.applyThemeMode(data.settings && data.settings.theme);
  } catch (e) {
    debugLog('Could not apply theme:', e);
  }

  await HaiiloI18n.initializeI18n();
  HaiiloI18n.localizeDocument();
  // Display version from manifest
  const manifest = browserAPI.runtime.getManifest();
  document.getElementById('versionInfo').textContent = `v${manifest.version}`;
  document.getElementById('footerVersion').textContent = t('extensionNameVersion', manifest.version);

  // Show Chrome-specific warning only on Chrome/Edge
  const isChrome = typeof browser === 'undefined';
  const warningElement = document.getElementById('chromePermissionWarning');
  if (warningElement) {
    warningElement.style.display = isChrome ? 'block' : 'none';
  }

  organizeOptionSections();
  await loadSettings();
  await loadDomains();
  await loadCustomHomepages();
  setupEventListeners();
  setupOptionsNavigation();
}

function organizeOptionSections() {
  const content = document.querySelector('.options-content');
  if (!content) return;

  const categories = [
    {
      title: t('general'),
      slug: 'general',
      sectionIds: ['general', 'general-language', 'general-muting', 'general-date-time']
    },
    {
      title: t('interface'),
      slug: 'interface',
      sectionIds: ['interface', 'interface-avatars', 'interface-reactions']
    },
    {
      title: t('behavior'),
      slug: 'behavior',
      sectionIds: ['behavior-homepage', 'behavior']
    },
    {
      title: t('domains'),
      slug: 'domains',
      sectionIds: ['domains']
    },
    {
      title: t('dataPrivacy'),
      slug: 'data-privacy',
      sectionIds: ['data']
    },
    {
      title: t('advanced'),
      slug: 'advanced',
      sectionIds: ['advanced']
    },
    {
      title: t('about'),
      slug: 'about',
      sectionIds: [],
      includeFooter: true
    }
  ];

  const saveStatus = document.getElementById('saveStatus');
  const footer = content.querySelector('footer');
  const categoryGroups = categories.map(category => {
    const group = document.createElement('section');
    group.className = 'options-category';
    group.setAttribute('aria-labelledby', `${category.slug}-heading`);

    const heading = document.createElement('h2');
    heading.className = 'options-category-title';
    heading.id = `${category.slug}-heading`;
    heading.textContent = category.title;
    const rule = document.createElement('hr');
    rule.className = 'options-category-rule';
    group.appendChild(rule);
    group.appendChild(heading);

    category.sectionIds.forEach(sectionId => {
      const section = document.getElementById(sectionId);
      if (section) group.appendChild(section);
    });

    if (category.includeFooter && footer) {
      group.appendChild(footer);
    }

    return group;
  });

  content.textContent = '';
  categoryGroups.forEach(group => content.appendChild(group));
  if (saveStatus) content.appendChild(saveStatus);
}

function setupOptionsNavigation() {
  const links = Array.from(document.querySelectorAll('.options-nav-link'));
  const sections = Array.from(document.querySelectorAll('[data-nav-section]'));
  if (links.length === 0 || sections.length === 0) return;

  const setActiveSection = (sectionName) => {
    links.forEach(link => {
      const isActive = link.dataset.section === sectionName;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'location');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  const initialTarget = window.location.hash.slice(1);
  const initialLink = links.find(link => link.getAttribute('href') === `#${initialTarget}`);
  setActiveSection(initialLink ? initialLink.dataset.section : links[0].dataset.section);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      const visibleSections = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visibleSections.length > 0) {
        setActiveSection(visibleSections[0].target.dataset.navSection);
      }
    }, {
      rootMargin: '-12% 0px -70% 0px',
      threshold: [0, 0.1]
    });

    sections.forEach(section => observer.observe(section));
  }
}

async function loadSettings() {
  const settings = await browserAPI.runtime.sendMessage({ action: 'getSettings' });

  const extensionEnabledInput = document.getElementById('extensionEnabled');
  if (extensionEnabledInput) {
    extensionEnabledInput.checked = settings.extensionEnabled !== false;
  }

  const languageSelect = document.getElementById('language');
  if (languageSelect) {
    languageSelect.value = settings.language || 'browser';
  }

  document.getElementById('defaultMuteDays').value = settings.defaultMuteDays || 7;
  document.getElementById('showMutedIndicator').checked = settings.showMutedIndicator !== false;
  document.getElementById('debugMode').checked = settings.debugMode || false;
  const messengerCheckbox = document.getElementById('keepMessengerExpanded');
  const widthSlider = document.getElementById('messengerPanelWidthPercent');
  const widthValue = document.getElementById('messengerPanelWidthValue');
  if (messengerCheckbox) {
    messengerCheckbox.checked = settings.keepMessengerExpanded === true;
  }
  if (widthSlider) {
    const width = clampMessengerPanelWidthPercent(settings.messengerPanelWidthPercent);
    widthSlider.value = width;
    if (widthValue) widthValue.textContent = `${width}%`;
  }
  currentThemePreference = HaiiloShared.resolveThemeMode(settings.theme);
  setThemeControl(currentThemePreference);

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
  document.getElementById('sortReactionsByCount').checked = settings.sortReactionsByCount !== false;
  document.getElementById('showReactionCountTooltip').checked = settings.showReactionCountTooltip === true;
  document.getElementById('showReactionCountInline').checked = settings.showReactionCountInline === true;
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
    emptyEl.textContent = t('noCustomDomains');
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
    btn.textContent = t('remove');

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
    emptyEl.textContent = t('noCustomHomepages');
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
          displayName = t('homepageHome');
        } else if (section === 'timeline') {
          displayName = t('homepageHomeSoft');
        } else {
          displayName = t('homepageSection', section.charAt(0).toUpperCase() + section.slice(1));
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
    descSpan.textContent = t('homepageLocation', [displayName, displayPath]);

    const btn = document.createElement('button');
    btn.className = 'danger remove-homepage-btn';
    btn.dataset.baseurl = baseUrl;
    btn.textContent = t('remove');

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

function scheduleSaveSettings() {
  clearTimeout(saveSettingsTimeout);
  saveSettingsTimeout = setTimeout(() => {
    saveSettings().catch(error => {
      console.error('Failed to save settings:', error);
    });
  }, 250);
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
  const languageSelect = document.getElementById('language');
  if (languageSelect) languageSelect.addEventListener('change', saveSettings);
  document.getElementById('debugMode').addEventListener('change', saveSettings);
  document.getElementById('keepMessengerExpanded').addEventListener('change', saveSettings);
  const themeGroup = document.getElementById('themeGroup');
  if (themeGroup) {
    themeGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.theme-segmented-btn');
      if (!btn) return;
      const mode = btn.dataset.themeValue;
      currentThemePreference = HaiiloShared.resolveThemeMode(mode);
      setThemeControl(currentThemePreference);
      HaiiloShared.applyThemeMode(mode);
      saveSettings();
    });
  }

  // Re-resolve the theme if the OS light/dark setting changes while the page
  // is open (only matters in 'system' mode).
  HaiiloShared.bindSystemThemeChange(() => {
    if (currentThemePreference === 'system') {
      HaiiloShared.applyThemeMode('system');
    }
  });
  document.getElementById('messengerPanelWidthPercent').addEventListener('input', (e) => {
    document.getElementById('messengerPanelWidthValue').textContent =
      `${clampMessengerPanelWidthPercent(e.target.value)}%`;
    scheduleSaveSettings();
  });
  document.getElementById('messengerPanelWidthPercent').addEventListener('change', saveSettings);
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
    scheduleSaveSettings();
  });
  document.getElementById('channelAvatarRingWidth').addEventListener('input', () => {
    updatePreview(false);
    scheduleSaveSettings();
  });

  // Square settings
  document.getElementById('channelAvatarSquareColor').addEventListener('input', () => {
    updatePreview(false);
    scheduleSaveSettings();
  });
  document.getElementById('channelAvatarSquareWidth').addEventListener('input', () => {
    updatePreview(false);
    scheduleSaveSettings();
  });

  // Badge settings
  document.getElementById('channelAvatarBadgeSize').addEventListener('input', (e) => {
    document.getElementById('badgeSizeValue').textContent = e.target.value + '%';
    updatePreview(false);
    scheduleSaveSettings();
  });

  document.getElementById('channelAvatarBadgePosition').addEventListener('change', () => {
    updatePreview(false);
    scheduleSaveSettings();
  });

  // Color mode settings
  document.getElementById('colorModeRandom').addEventListener('change', () => {
    updatePreview(true);
    scheduleSaveSettings();
  });

  document.getElementById('colorModeFixed').addEventListener('change', () => {
    updatePreview(true);
    scheduleSaveSettings();
  });

  document.getElementById('channelAvatarFixedColor').addEventListener('input', () => {
    updatePreview(true);
    scheduleSaveSettings();
  });

  // Auto-expand settings
  document.getElementById('autoExpandEnabled').addEventListener('change', saveSettings);
  document.getElementById('autoExpandScope').addEventListener('change', saveSettings);
  document.getElementById('sortReactionsByCount').addEventListener('change', saveSettings);
  document.getElementById('showReactionCountTooltip').addEventListener('change', saveSettings);
  document.getElementById('showReactionCountInline').addEventListener('change', saveSettings);

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
          showStatus(t('cloudSyncUnavailable'), 'error');
          return;
        }
      }
      scheduleSaveSettings();
    });
  }
  document.getElementById('autoExpandClicksPerList').addEventListener('change', () => {
    // Clamp the value client-side as a safety net.
    const input = document.getElementById('autoExpandClicksPerList');
    let v = parseInt(input.value, 10);
    if (isNaN(v)) v = 3;
    v = Math.max(0, Math.min(10, v));
    input.value = v;
    scheduleSaveSettings();
  });
  document.getElementById('autoExpandDelayMs').addEventListener('change', () => {
    const input = document.getElementById('autoExpandDelayMs');
    let v = parseInt(input.value, 10);
    if (isNaN(v)) v = 300;
    v = Math.max(100, Math.min(1000, v));
    input.value = v;
    scheduleSaveSettings();
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
    showStatus(t('validDomain'), 'error');
    return;
  }

  try {
    // Check if domain already exists
    const existingDomains = await browserAPI.runtime.sendMessage({ action: 'getCustomDomains' });
    if (existingDomains && existingDomains.includes(domain)) {
      showStatus(t('domainAlreadyExists'), 'error');
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
      showStatus(t('permissionDenied'), 'error');
      return;
    }

    // Now add the domain to storage via background script
    const response = await browserAPI.runtime.sendMessage({ action: 'addCustomDomain', domain });
    if (response && response.success) {
      input.value = '';
      await loadDomains();
      showStatus(t('domainAdded'), 'success');
    } else {
      const errorMsg = response && response.error ? response.error : 'Failed to add domain';
      showStatus(errorMsg, 'error');
      console.error('Error adding domain:', errorMsg);
    }
  } catch (error) {
    showStatus(t('failedImport', error.message), 'error');
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
      showStatus(t('domainRemoved'), 'success');
      return;
    }

    await loadDomains();
    showStatus(t('domainRemoved'), 'success');
  } catch (error) {
    console.error('Error removing domain:', error);
    showStatus(t('failedImport', error.message), 'error');
  }
}

async function removeCustomHomepage(baseUrl) {
  try {
    await browserAPI.runtime.sendMessage({ action: 'removeCustomHomepage', baseUrl });
    await loadCustomHomepages();
    showStatus(t('domainRemoved'), 'success');
  } catch (error) {
    console.error('Error removing custom homepage:', error);
    showStatus(t('failedImport', error.message), 'error');
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
    language: document.getElementById('language')?.value || 'browser',
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
    sortReactionsByCount: document.getElementById('sortReactionsByCount').checked,
    showReactionCountTooltip: document.getElementById('showReactionCountTooltip').checked,
    showReactionCountInline: document.getElementById('showReactionCountInline').checked,
    keepMessengerExpanded: document.getElementById('keepMessengerExpanded').checked,
    messengerPanelWidthPercent: clampMessengerPanelWidthPercent(document.getElementById('messengerPanelWidthPercent').value),
    cloudSync: document.getElementById('cloudSync') ? document.getElementById('cloudSync').checked : false,
    theme: HaiiloShared.resolveThemeMode(getThemeControlValue())
  };

  await browserAPI.runtime.sendMessage({ action: 'saveSettings', settings });
  debugLog('[Options] Settings saved');

  if (settings.language !== HaiiloI18n.getLanguagePreference()) {
    window.location.reload();
    return;
  }
  showStatus(t('settingsSaved'), 'success');
}

async function applyLocaleDefaults() {
  try {
    const locale = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    const response = await browserAPI.runtime.sendMessage({ action: 'applyLocaleDefaults', locale });
    if (response && response.success) {
      await loadSettings();
      showStatus(t('localeDefaultsApplied'), 'success');
      return;
    }
    showStatus(t('couldNotApplyLocale'), 'error');
  } catch (error) {
    console.error('Error applying locale defaults:', error);
    showStatus(t('failedImport', error.message), 'error');
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
  showStatus(t('allSettingsExported'), 'success');
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate file has required data
    if (!data.mutedUsers && !data.settings) {
      throw new Error(t('invalidImport'));
    }

    // Import muted users — run each entry through a checkpoint so garbage from
    // a malformed/edited backup file (no name, non-numeric dates, expired
    // temporary mutes, absurdly large lists) never ends up in the list.
    let userCount = 0;
    let skippedMutedUsers = 0;
    if (data.mutedUsers !== undefined && data.mutedUsers !== null) {
      if (!Array.isArray(data.mutedUsers)) {
        throw new Error(t('invalidImport'));
      }
      const validated = HaiiloShared.normalizeMutedUsers(data.mutedUsers);
      skippedMutedUsers = validated.skipped;
      for (const user of validated.users) {
        const days = user.permanent
          ? null
          : Math.max(1, Math.ceil((user.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
        await browserAPI.runtime.sendMessage({
          action: 'muteUser',
          userName: user.name,
          days
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
    if (userCount > 0) messages.push(t('importMutedUsers', userCount));
    if (data.settings) messages.push(t('importAllSettings'));
    if (data.customDomains && data.customDomains.length > 0) {
      messages.push(t('importDomainsNeedReauth', data.customDomains.length));
    }
    if (data.customHomepages && Object.keys(data.customHomepages).length > 0) {
      messages.push(t('importCustomHomepages', Object.keys(data.customHomepages).length));
    }

    showStatus(t('importedData', messages.join(' and ')), 'success');
  } catch (err) {
    showStatus(t('failedImport', err.message), 'error');
  }

  // Reset file input
  e.target.value = '';
}

async function clearAllData() {
  if (!confirm(t('confirmReset'))) {
    return;
  }

  const mutedUsers = await browserAPI.runtime.sendMessage({ action: 'getMutedUsers' });

  for (const user of mutedUsers) {
    await browserAPI.runtime.sendMessage({ action: 'unmuteUser', userName: user.name });
  }

  // Reset all settings to defaults
  await browserAPI.runtime.sendMessage({ action: 'resetSettings' });
  await loadSettings();

  showStatus(t('resetComplete'), 'success');
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
        const svg = HaiiloShared.buildGroupBadgeSVG(Math.floor(badgeSize * 0.6));
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
  scheduleSaveSettings();
  showStatus(t('ringSettingsReset'), 'success');
}

function resetSquareSettings() {
  document.getElementById('channelAvatarSquareColor').value = '#502379';
  document.getElementById('channelAvatarSquareWidth').value = 2;
  updatePreview(false);
  scheduleSaveSettings();
  showStatus(t('squareSettingsReset'), 'success');
}

function resetBadgeSettings() {
  document.getElementById('channelAvatarBadgeSize').value = 100;
  document.getElementById('badgeSizeValue').textContent = '100%';
  updatePreview(false);
  saveSettings();
  showStatus(t('badgeSettingsReset'), 'success');
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
