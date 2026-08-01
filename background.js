// Background service worker for Haiilo Enhancer
// Compatible with both Chrome (Manifest V3) and Firefox (Manifest V2)
//# sourceURL=haiilo-enhancer/background.js

try {
  importScripts('shared.js', 'i18n.js');
} catch (error) {
  console.error('Failed to load shared libraries:', error);
}

// Browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
// Firefox MV2 uses browser.browserAction; Chrome MV3 uses chrome.action (or browser.action)
// Chrome also exposes the `browser` namespace in MV3 for compatibility, but only with `action`,
// not `browserAction` — so we must detect the actual API surface, not just the global.
const badgeAPI = (typeof browser !== 'undefined' && browser.browserAction)
  ? browser.browserAction
  : (browserAPI.action || chrome.action);

// Shared constants and helpers (single source of truth in shared.js).
const DATE_TIME_PRESETS = HaiiloShared.DATE_TIME_PRESETS;
const normalizeDateFormatValue = HaiiloShared.normalizeDateFormatValue;
const getDateTimePresetOptions = HaiiloShared.getDateTimePresetOptions;
const clampMessengerPanelWidthPercent = HaiiloShared.clampMessengerPanelWidthPercent;

function normalizeLocale(locale) {
  return String(locale || '').replace('_', '-').trim().toLowerCase();
}

function getLocaleDateTimePresetId(locale) {
  const normalized = normalizeLocale(locale);
  const base = normalized.split('-')[0];

  const languageFallbacks = {
    de: 'centralEuropean24h',
    fr: 'westernEuropean24h',
    nl: 'dutch24h',
    it: 'westernEuropean24h',
    es: 'westernEuropean24h',
    pt: 'westernEuropean24h',
    pl: 'centralEuropean24h',
    ru: 'centralEuropean24h',
    sv: 'iso860124h',
    da: 'centralEuropean24h',
    nb: 'centralEuropean24h',
    nn: 'centralEuropean24h',
    fi: 'finnish24h',
    tr: 'centralEuropean24h',
    cs: 'spacedCentral24h',
    sk: 'spacedCentral24h',
    hu: 'hungarian24h',
    ro: 'centralEuropean24h',
    uk: 'centralEuropean24h',
    el: 'westernEuropean24h',
    he: 'middleEastern24h',
    ar: 'middleEastern24h',
    hi: 'southAsian12h',
    ja: 'eastAsian24h',
    ko: 'korean24h',
    zh: 'eastAsian24h',
    th: 'southeastAsian24h',
    vi: 'southeastAsian24h',
    id: 'southeastAsian24h',
    ms: 'southeastAsian24h',
    fa: 'iso860124h',
    ca: 'westernEuropean24h',
    eu: 'iso860124h',
    gl: 'westernEuropean24h',
    af: 'iso860124h'
  };

  if (['en-ca', 'en-au', 'en-nz', 'en-ie', 'en-mt', 'en-cy'].includes(normalized)) return 'westernEuropean12h';
  if (['en-gb', 'en-sg', 'en-hk', 'en-my'].includes(normalized)) return 'westernEuropean24h';
  if (normalized === 'en-in' || normalized === 'hi-in' || normalized === 'bn-bd' || normalized === 'bn-in' || normalized === 'ur-pk' || normalized === 'pa-in' || normalized === 'ta-in') return 'southAsian12h';
  if (normalized === 'en-za') return 'iso860124h';
  if (normalized === 'en-us' || normalized === 'en-ph' || normalized === 'tl-ph' || normalized === 'en') return 'northAmerican12h';

  if (normalized === 'nl-nl' || normalized === 'nl') return 'dutch24h';
  if (normalized === 'nl-be') return 'westernEuropean24h';

  if (normalized === 'fr-ca' || normalized === 'sv-se' || normalized === 'lt-lt' || normalized === 'af-za' || normalized === 'en-za' || normalized === 'eu-es') {
    return 'iso860124h';
  }
  if (['de-de', 'de-at', 'de-ch', 'de-li', 'de-lu', 'fr-ch', 'it-ch', 'pl-pl', 'ro-ro', 'bg-bg', 'tr-tr', 'tr-cy', 'ka-ge', 'hy-am', 'az-az', 'uk-ua', 'be-by', 'ru-ru', 'ru-by', 'ru-kz', 'lb-lu', 'mk-mk', 'da-dk', 'nb-no', 'nn-no', 'et-ee', 'lv-lv', 'sv-fi', 'is-is'].includes(normalized)) {
    return 'centralEuropean24h';
  }
  if (['fr-fr', 'fr-be', 'fr-lu', 'fr-mc', 'fr-ma', 'fr-tn', 'fr-sn', 'fr-ci', 'fr-cm', 'fr-mg', 'it-it', 'es-es', 'pt-pt', 'ca-es', 'gl-es', 'el-gr', 'el-cy', 'mt-mt', 'fo-fo'].includes(normalized)) {
    return 'westernEuropean24h';
  }
  if (normalized === 'fi-fi') return 'finnish24h';
  if (['cs-cz', 'sk-sk', 'sl-si'].includes(normalized)) return 'spacedCentral24h';
  if (['hr-hr', 'bs-ba', 'sr-rs', 'sr-ba'].includes(normalized)) return 'dottedSlavic24h';
  if (normalized === 'hu-hu') return 'hungarian24h';
  if (normalized === 'ko-kr') return 'korean24h';
  if (['ja-jp', 'zh-cn'].includes(normalized)) return 'eastAsian24h';
  if (normalized === 'zh-tw') return 'eastAsian12h';
  if (normalized === 'zh-hk' || normalized === 'zh-mo') return 'westernEuropean12h';
  if (normalized === 'fa-ir' || normalized.startsWith('ar-') || normalized === 'he-il') return 'middleEastern24h';
  if (['hi-in', 'bn-bd', 'bn-in', 'ur-pk', 'pa-in', 'ta-in'].includes(normalized)) return 'southAsian12h';
  if (['ms-my', 'ms-bn', 'th-th', 'vi-vn', 'id-id', 'km-kh', 'lo-la', 'my-mm'].includes(normalized)) return 'southeastAsian24h';
  if (['sw-ke', 'am-et'].includes(normalized)) return 'southeastAsian12h';
  if (['es-mx', 'es-co', 'es-cr', 'es-gt', 'es-sv', 'es-hn', 'es-ni', 'es-pa', 'es-do'].includes(normalized)) return 'latinAmerican12h';
  if (['es-ar', 'es-cl', 'es-pe', 'es-ve', 'es-ec', 'es-bo', 'es-py', 'es-uy', 'es-cu'].includes(normalized)) return 'latinAmerican24h';
  if (normalized === 'en-sg' || normalized === 'en-hk' || normalized === 'en-my') return 'southeastAsian24h';
  if (languageFallbacks[base]) return languageFallbacks[base];
  if (base === 'en') return 'northAmerican12h';

  return 'northAmerican12h';
}

function getLocaleDateTimeDefaults(locale) {
  return DATE_TIME_PRESETS[getLocaleDateTimePresetId(locale)] || DATE_TIME_PRESETS.northAmerican12h;
}

function getRequestedLocale(preferredLocale) {
  return normalizeLocale(preferredLocale || (browserAPI.i18n && typeof browserAPI.i18n.getUILanguage === 'function' ? browserAPI.i18n.getUILanguage() : '') || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en-US');
}

// Debug logging helper
function debugLog(...args) {
  browserAPI.storage.local.get('settings').then(data => {
    const settings = data.settings || DEFAULT_SETTINGS;
    if (settings.debugMode) {
      console.log(...args);
    }
  });
}

// Default settings
const DEFAULT_SETTINGS = {
  language: 'browser', // 'browser' or one of the bundled locale codes
  extensionEnabled: true,
  defaultMuteDays: 7,
  showMutedIndicator: true,
  debugMode: false,
  enhanceChannelAvatars: true,
  channelAvatarStyle: 'ring', // 'ring', 'square', or 'badge'
  channelAvatarRingColor: '#502379', // Brand purple
  channelAvatarRingWidth: 2, // Ring border width in pixels (0-5)
  channelAvatarSquareColor: '#502379', // Brand purple for square border
  channelAvatarSquareWidth: 2, // Square border width in pixels (0-5)
  channelAvatarBadgeSize: 100, // Badge size as percentage (50-150, 100 = default)
  channelAvatarBadgePosition: 'bottom-left', // 'bottom-left' or 'top-left'
  channelAvatarColorMode: 'random', // 'random' or 'fixed'
  channelAvatarFixedColor: '#0f939d', // Haiilo teal color when colorMode is 'fixed'
  dateFormat: 'northAmerican12h', // locale-aware preset id
  timeFormat: '12h', // '12h' or '24h'
  keepMessengerExpanded: false, // Keep messenger panel permanently expanded
  messengerPanelWidthPercent: 100, // Messenger width scale (50-125, 100 = Haiilo default)
  autoExpandEnabled: false, // Auto-click "Show more" buttons in sidebar lists
  autoExpandClicksPerList: 3, // Max number of "Show more" clicks per list (0-10)
  autoExpandDelayMs: 300, // Delay between clicks in ms (100-1000)
  autoExpandScope: 'both', // Which lists to expand: 'both', 'workspaces', or 'pages'
  cloudSync: false, // Sync settings and muted users via browser account (opt-in)
  theme: 'system', // 'system' (follow browser), 'light', or 'dark'
  sortReactionsByCount: true, // Sort reaction emojis by count (most used first)
  showReactionCountTooltip: true, // Show reaction count breakdown on hover
  showReactionCountInline: false // Show counts next to reaction emojis
};

function normalizeSettings(settings = {}) {
  const normalized = { ...DEFAULT_SETTINGS };
  Object.keys(DEFAULT_SETTINGS).forEach(key => {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      normalized[key] = settings[key];
    }
  });
  normalized.messengerPanelWidthPercent = clampMessengerPanelWidthPercent(normalized.messengerPanelWidthPercent);
  normalized.language = ['browser', 'en', 'de', 'cs', 'es', 'fr', 'hu', 'it', 'nl', 'pl'].includes(normalized.language)
    ? normalized.language
    : DEFAULT_SETTINGS.language;
  normalized.dateFormat = normalizeDateFormatValue(normalized.dateFormat);
  const preset = DATE_TIME_PRESETS[normalized.dateFormat] || DATE_TIME_PRESETS.northAmerican12h;
  normalized.timeFormat = normalized.timeFormat === '24h' ? '24h' : preset.timeFormat;
  normalized.theme = ['system', 'light', 'dark'].includes(normalized.theme)
    ? normalized.theme
    : DEFAULT_SETTINGS.theme;
  return normalized;
}

function buildLocaleAwareSettings() {
  const locale = getRequestedLocale();
  const localeDefaults = getLocaleDateTimeDefaults(locale);
  return normalizeSettings({
    ...DEFAULT_SETTINGS,
    dateFormat: localeDefaults ? getLocaleDateTimePresetId(locale) : DEFAULT_SETTINGS.dateFormat,
    timeFormat: localeDefaults ? localeDefaults.timeFormat : DEFAULT_SETTINGS.timeFormat
  });
}

// Default domains
const DEFAULT_DOMAINS = ['haiilo.app', 'haiilo.com'];

const CLOUD_SYNC_USER_LIMIT = 50;

// Write settings + mutedUsers to storage.sync if cloudSync is enabled.
// If mutedUsers exceeds the limit, disable cloudSync and broadcast a warning.
async function syncToCloud() {
  try {
    const data = await browserAPI.storage.local.get(['settings', 'mutedUsers']);
    const settings = data.settings || DEFAULT_SETTINGS;
    if (!settings.cloudSync) return;

    const mutedUsers = data.mutedUsers || [];

    if (mutedUsers.length > CLOUD_SYNC_USER_LIMIT) {
      // Disable cloud sync and persist the change
      settings.cloudSync = false;
      await browserAPI.storage.local.set({ settings });
      await broadcastMessageToAllHaiiloTabs({ action: 'settingsUpdated' });
      await broadcastMessageToAllHaiiloTabs({
        action: 'cloudSyncDisabled',
        reason: `Cloud sync disabled: muted user list exceeds the ${CLOUD_SYNC_USER_LIMIT}-user limit.`
      });
      debugLog('[CloudSync] Disabled — user limit exceeded');
      return;
    }

    await browserAPI.storage.sync.set({ settings, mutedUsers });
    debugLog('[CloudSync] Synced to cloud:', mutedUsers.length, 'users');
  } catch (e) {
    console.error('[CloudSync] Failed to sync to cloud:', e);
  }
}

// Pull settings + mutedUsers from storage.sync and merge into local storage.
// Only runs if cloudSync is enabled in either local or sync settings.
async function pullFromCloud() {
  try {
    const syncData = await browserAPI.storage.sync.get(['settings', 'mutedUsers']);
    if (!syncData.settings || !syncData.settings.cloudSync) return;

    const localData = await browserAPI.storage.local.get(['settings', 'mutedUsers']);
    const localSettings = localData.settings || DEFAULT_SETTINGS;

    // Merge: prefer sync data (it's the "canonical" cloud copy)
    const mergedSettings = normalizeSettings({ ...localSettings, ...syncData.settings });
    const mergedUsers = syncData.mutedUsers || localData.mutedUsers || [];

    await browserAPI.storage.local.set({ settings: mergedSettings, mutedUsers: mergedUsers });
    debugLog('[CloudSync] Pulled from cloud:', mergedUsers.length, 'users');
  } catch (e) {
    console.error('[CloudSync] Failed to pull from cloud:', e);
  }
}

// Initialize extension on install
browserAPI.runtime.onInstalled.addListener(async () => {
  try {
    // Initialize storage with defaults if not set
    const data = await browserAPI.storage.local.get([
      'mutedUsers',
      'settings',
      'customDomains',
      'customHomepages',
      'disabledDomains',
      'language',
      'extensionEnabled',
      'defaultMuteDays',
      'showMutedIndicator',
      'debugMode',
      'enhanceChannelAvatars',
      'channelAvatarStyle',
      'channelAvatarRingColor',
      'channelAvatarRingWidth',
      'channelAvatarSquareColor',
      'channelAvatarSquareWidth',
      'channelAvatarBadgeSize',
      'channelAvatarBadgePosition',
      'channelAvatarColorMode',
      'channelAvatarFixedColor',
      'dateFormat',
      'timeFormat',
      'keepMessengerExpanded',
      'messengerPanelWidthPercent',
      'autoExpandEnabled',
      'autoExpandClicksPerList',
      'autoExpandDelayMs',
      'autoExpandScope',
      'cloudSync',
      'theme',
      'sortReactionsByCount',
      'showReactionCountTooltip',
      'showReactionCountInline'
    ]);

    if (!data.mutedUsers) {
      await browserAPI.storage.local.set({ mutedUsers: [] });
    }

    if (!data.settings) {
      await browserAPI.storage.local.set({ settings: buildLocaleAwareSettings() });
    } else {
      await browserAPI.storage.local.set({ settings: normalizeSettings(data.settings) });
    }

    if (!data.customDomains) {
      await browserAPI.storage.local.set({ customDomains: [] });
    }

    if (!data.customHomepages) {
      await browserAPI.storage.local.set({ customHomepages: {} });
    }

    if (!data.disabledDomains) {
      await browserAPI.storage.local.set({ disabledDomains: [] });
    }

    // Create context menu
    try {
      await createContextMenu();
    } catch (e) {
      console.error('Error creating context menu on install:', e);
    }

    // Register dynamic content scripts for custom domains
    try {
      await registerDynamicContentScripts();
    } catch (e) {
      console.error('Error registering dynamic content scripts on install:', e);
    }

    // Inject content scripts into existing tabs
    try {
      await injectContentScripts();
    } catch (e) {
      console.error('Error injecting content scripts on install:', e);
    }
  } catch (err) {
    console.error('Error in onInstalled listener:', err);
  }
});

// Create context menu on startup and re-register content scripts
browserAPI.runtime.onStartup.addListener(async () => {
  await pullFromCloud();
  await createContextMenu();

  // Re-register dynamic content scripts (they don't persist across browser restarts)
  await registerDynamicContentScripts();
});

// Inject content script when navigating to Haiilo pages
// Note: Dynamic content scripts handle automatic injection for custom domains
// This listener serves as a fallback and handles default domains
browserAPI.webNavigation.onCompleted.addListener(async (details) => {
  if (await isHaiiloTab({ url: details.url })) {
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: details.tabId },
        files: ['shared.js', 'i18n.js', 'content.js']
      });
      debugLog('Content script injected on navigation to:', details.url);
    } catch (e) {
      debugLog('Could not inject content script on navigation:', e.message);
    }
  }
});

async function createContextMenu() {
  const settings = normalizeSettings((await browserAPI.storage.local.get('settings')).settings || DEFAULT_SETTINGS);
  await initializeI18n(settings.language);
  if (settings.extensionEnabled === false) {
    browserAPI.contextMenus.removeAll();
    return;
  }

  // Get all domains (default + custom) for targetUrlPatterns
  const allDomains = await getAllDomains();

  // Build targetUrlPatterns for all domains
  const targetUrlPatterns = [];
  allDomains.forEach(domain => {
    targetUrlPatterns.push(
      `https://*.${domain}/home/*`,
      `https://${domain}/home/*`,
      `https://*.${domain}/pages/*`,
      `https://${domain}/pages/*`,
      `https://*.${domain}/workspaces/*`,
      `https://${domain}/workspaces/*`,
      `http://*.${domain}/home/*`,
      `http://${domain}/home/*`,
      `http://*.${domain}/pages/*`,
      `http://${domain}/pages/*`,
      `http://*.${domain}/workspaces/*`,
      `http://${domain}/workspaces/*`
    );
  });

  // Build documentUrlPatterns for all domains
  const documentUrlPatterns = [];
  allDomains.forEach(domain => {
    documentUrlPatterns.push(
      `https://*.${domain}/*`,
      `https://${domain}/*`,
      `http://*.${domain}/*`,
      `http://${domain}/*`
    );
  });

  // Remove existing menu items first
  browserAPI.contextMenus.removeAll(() => {
    // Create parent menu
    browserAPI.contextMenus.create({
      id: 'hush-parent',
      title: i18nMessage('extensionName'),
      contexts: ['link', 'selection']
    });

    // Mute permanently
    browserAPI.contextMenus.create({
      id: 'mute-permanent',
      parentId: 'hush-parent',
      title: i18nMessage('muteUserPermanently'),
      contexts: ['link', 'selection']
    });

    // Mute for default days
    browserAPI.contextMenus.create({
      id: 'mute-default',
      parentId: 'hush-parent',
      title: i18nMessage('muteDefaultPeriod'),
      contexts: ['link', 'selection']
    });

    // Separator
    browserAPI.contextMenus.create({
      id: 'separator-1',
      parentId: 'hush-parent',
      type: 'separator',
      contexts: ['link', 'selection']
    });

    // Mute for specific durations
    const durations = [1, 3, 7, 14, 30, 90];
    durations.forEach(days => {
      browserAPI.contextMenus.create({
        id: `mute-${days}`,
        parentId: 'hush-parent',
        title: i18nMessage('muteForDays', days),
        contexts: ['link', 'selection']
      });
    });

    // Separator
    browserAPI.contextMenus.create({
      id: 'separator-2',
      parentId: 'hush-parent',
      type: 'separator',
      contexts: ['link', 'selection']
    });

    // Set as default homepage (only shown for valid homepage links)
    browserAPI.contextMenus.create({
      id: 'set-homepage',
      parentId: 'hush-parent',
      title: i18nMessage('setDefaultHomepage'),
      contexts: ['link'],
      documentUrlPatterns: documentUrlPatterns,
      targetUrlPatterns: targetUrlPatterns
    });
  });
}

// Handle context menu clicks
browserAPI.contextMenus.onClicked.addListener(async (info, tab) => {
  const settings = (await browserAPI.storage.local.get('settings')).settings || DEFAULT_SETTINGS;
  if (!settings.extensionEnabled) {
    debugLog('Extension is disabled, ignoring context menu click');
    return;
  }

  debugLog('Context menu clicked:', info);

  // Handle setting custom homepage
  if (info.menuItemId === 'set-homepage') {
    handleSetHomepage(info, tab);
    return;
  }

  // Get user name from selection or try to extract from link
  let userName = null;

  // First, ensure content script is injected
  if (await isHaiiloTab(tab)) {
    try {
      // Check if content script is already injected by trying to send a ping
      try {
        await browserAPI.tabs.sendMessage(tab.id, { action: 'ping' }).catch(() => null);
        debugLog('Content script already present');
      } catch (pingError) {
        // Content script not present, inject it
        await browserAPI.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['shared.js', 'i18n.js', 'content.js']
        });
        debugLog('Content script injected successfully');
        
        // Wait a moment for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (e) {
      debugLog('Could not inject content script:', e.message);
    }
  } else {
    debugLog('Not a Haiilo tab, skipping content script injection');
  }

  if (info.selectionText) {
    userName = info.selectionText.trim();
    debugLog('Username from selection:', userName);
  } else if (info.linkUrl) {
    // Try to extract username from the page via content script
    try {
      const response = await browserAPI.tabs.sendMessage(tab.id, {
        action: 'getUserNameFromElement'
      }).catch(() => null);
      if (response && response.userName) {
        userName = response.userName;
        debugLog('Username from element:', userName);
      }
    } catch (e) {
      // This catch block should not be reached due to the .catch() above
      console.error('Could not get username from element:', e);
    }
  }

  if (!userName) {
    // Ask content script for the last right-clicked username
    try {
      const response = await browserAPI.tabs.sendMessage(tab.id, {
        action: 'getLastRightClickedUser'
      }).catch(() => null);
      if (response && response.userName) {
        userName = response.userName;
        debugLog('Username from last right-click:', userName);
      }
    } catch (e) {
      // This catch block should not be reached due to the .catch() above
      console.error('Could not get last right-clicked user:', e);
    }
  }

  if (!userName) {
    debugLog('No username found to mute');
    return;
  }

  // Determine mute duration
  let muteDays = null; // null = permanent

  if (info.menuItemId === 'mute-permanent') {
    muteDays = null;
  } else if (info.menuItemId === 'mute-default') {
    muteDays = settings.defaultMuteDays;
  } else if (info.menuItemId.startsWith('mute-')) {
    muteDays = parseInt(info.menuItemId.replace('mute-', ''), 10);
  }

  // Add user to muted list
  await muteUser(userName, muteDays);

  // Notify content script to update
  try {
    await browserAPI.tabs.sendMessage(tab.id, { action: 'refreshFilter' });
    debugLog('Sent refreshFilter message to tab', tab.id);
  } catch (e) {
    console.error('Failed to send refreshFilter message:', e);
    // Try to inject content script and send message again
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['shared.js', 'i18n.js', 'content.js']
      });
      debugLog('Re-injected content script, trying refresh again');
      await browserAPI.tabs.sendMessage(tab.id, { action: 'refreshFilter' });
    } catch (retryError) {
      console.error('Failed to refresh after re-injection:', retryError);
    }
  }

  // Show an undo toast in the tab so the mute can be reverted from the page.
  // Best effort — the tab may not have the content script loaded yet.
  try {
    await browserAPI.tabs.sendMessage(tab.id, { action: 'showUndoToast', userName });
    debugLog('Sent showUndoToast message to tab', tab.id);
  } catch (e) {
    debugLog('Could not send undo toast to tab', tab.id);
  }
});

// Mute a user
async function muteUser(userName, days) {
  debugLog('Muting user:', userName, 'for', days ? `${days} days` : 'permanently');
  const data = await browserAPI.storage.local.get('mutedUsers');
  const mutedUsers = data.mutedUsers || [];

  // Check if user already exists
  const existingIndex = mutedUsers.findIndex(u => u.name.toLowerCase() === userName.toLowerCase());

  const muteEntry = {
    name: userName,
    mutedAt: Date.now(),
    expiresAt: days ? Date.now() + (days * 24 * 60 * 60 * 1000) : null,
    permanent: !days
  };

  if (existingIndex >= 0) {
    mutedUsers[existingIndex] = muteEntry;
  } else {
    mutedUsers.push(muteEntry);
  }

  await browserAPI.storage.local.set({ mutedUsers });
  await syncToCloud();
  debugLog(`Muted user: ${userName}`, days ? `for ${days} days` : 'permanently');
  debugLog('Updated muted users list:', mutedUsers);
}

// Listen for messages from content script or popup
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getMutedUsers') {
    getMutedUsers().then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.action === 'unmuteUser') {
    unmuteUser(message.userName).then(() => {
      sendResponse({ success: true });
      // Notify all Haiilo tabs to refresh
      notifyAllHaiiloTabs();
    });
    return true;
  }

  if (message.action === 'muteUser') {
    muteUser(message.userName, message.days).then(() => {
      sendResponse({ success: true });
      notifyAllHaiiloTabs();
    });
    return true;
  }

  if (message.action === 'getSettings') {
    browserAPI.storage.local.get('settings').then(data => {
      sendResponse(normalizeSettings(data.settings));
    });
    return true;
  }

  if (message.action === 'saveSettings') {
    // Merge with existing stored settings so keys not present in the incoming
    // object are preserved.
    browserAPI.storage.local.get('settings').then(async (data) => {
      const previousSettings = normalizeSettings(data.settings || DEFAULT_SETTINGS);
      const merged = { ...previousSettings, ...message.settings };
      const settings = normalizeSettings(merged);
      await browserAPI.storage.local.set({ settings });
      // If cloudSync was just turned off, clear data from storage.sync
      if (!settings.cloudSync) {
        browserAPI.storage.sync.remove(['settings', 'mutedUsers']).catch(e => {
          console.error('[CloudSync] Failed to clear sync storage:', e);
        });
      } else {
        await syncToCloud();
      }
      await createContextMenu();
      await updateAllBadges();
      await broadcastMessageToAllHaiiloTabs({ action: 'settingsUpdated' });
      if (settings.language !== previousSettings.language) {
        await broadcastMessageToAllHaiiloTabs({ action: 'languageChanged' });
      }
      sendResponse({ success: true });
    }).catch(e => {
      console.error('Failed to save settings:', e);
      sendResponse({ success: false, error: e.message });
    });
    return true;
  }

  if (message.action === 'resetSettings') {
    browserAPI.storage.local.set({ settings: buildLocaleAwareSettings() }).then(async () => {
      await createContextMenu();
      await updateAllBadges();
      await broadcastMessageToAllHaiiloTabs({ action: 'settingsUpdated' });
      await broadcastMessageToAllHaiiloTabs({ action: 'languageChanged' });
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'applyLocaleDefaults') {
    browserAPI.storage.local.get('settings').then(async data => {
      const settings = normalizeSettings(data.settings || DEFAULT_SETTINGS);
      const locale = getRequestedLocale(message.locale);
      const localeDefaults = getLocaleDateTimeDefaults(locale);
      settings.dateFormat = getLocaleDateTimePresetId(locale);
      settings.timeFormat = localeDefaults.timeFormat;
      await browserAPI.storage.local.set({ settings });
      await createContextMenu();
      await updateAllBadges();
      await broadcastMessageToAllHaiiloTabs({ action: 'settingsUpdated' });
      sendResponse({ success: true, settings });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'updateHiddenCount') {
    debugLog('Updating badge for tab', sender.tab.id, 'with count', message.count);
    if (!badgeAPI || typeof badgeAPI.setBadgeText !== 'function') {
      debugLog('Badge API not available, skipping update');
      sendResponse({ success: false, error: 'Badge API unavailable' });
      return true;
    }
    // Update badge with hidden count or OFF status
    browserAPI.storage.local.get('settings').then(data => {
      const settings = data.settings || DEFAULT_SETTINGS;
      if (settings.extensionEnabled === false || message.domainDisabled === true) {
        badgeAPI.setBadgeText({ text: 'OFF', tabId: sender.tab.id });
        badgeAPI.setBadgeBackgroundColor({ color: '#888888', tabId: sender.tab.id });
        debugLog('Badge updated with OFF status');
      } else if (message.count > 0) {
        badgeAPI.setBadgeText({ text: message.count.toString(), tabId: sender.tab.id });
        badgeAPI.setBadgeBackgroundColor({ color: '#6366f1', tabId: sender.tab.id });
        debugLog('Badge updated with count:', message.count);
      } else {
        badgeAPI.setBadgeText({ text: '', tabId: sender.tab.id });
        debugLog('Badge cleared');
      }
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error in updateHiddenCount badge update:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'getCustomDomains') {
    browserAPI.storage.local.get('customDomains').then(data => {
      sendResponse(data.customDomains || []);
    });
    return true;
  }

  if (message.action === 'getDisabledDomains') {
    browserAPI.storage.local.get('disabledDomains').then(data => {
      sendResponse(data.disabledDomains || []);
    });
    return true;
  }

  if (message.action === 'setDomainEnabled') {
    setDomainEnabled(message.domain, message.enabled).then(() => {
      sendResponse({ success: true });
      broadcastMessageToAllHaiiloTabs({ action: 'settingsUpdated' });
      updateAllBadges();
    });
    return true;
  }

  if (message.action === 'addCustomDomain') {
    addCustomDomain(message.domain)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'removeCustomDomain') {
    removeCustomDomain(message.domain).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'isHaiiloTab') {
    isHaiiloTab(sender.tab).then(result => {
      sendResponse({ isHaiilo: result });
    });
    return true;
  }

  if (message.action === 'getCustomHomepages') {
    browserAPI.storage.local.get('customHomepages').then(data => {
      sendResponse(data.customHomepages || {});
    });
    return true;
  }

  if (message.action === 'setCustomHomepage') {
    setCustomHomepage(message.baseUrl, message.homepageUrl).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'removeCustomHomepage') {
    removeCustomHomepage(message.baseUrl).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Get active muted users (filter out expired)
async function getMutedUsers() {
  const data = await browserAPI.storage.local.get('mutedUsers');
  let mutedUsers = data.mutedUsers || [];
  const now = Date.now();

  debugLog('Retrieved muted users from storage:', mutedUsers);

  // Filter out expired users
  const activeUsers = mutedUsers.filter(user => {
    if (user.permanent || !user.expiresAt) return true;
    return user.expiresAt > now;
  });

  debugLog('Active muted users after filtering:', activeUsers);

  // Save if we filtered any out
  if (activeUsers.length !== mutedUsers.length) {
    await browserAPI.storage.local.set({ mutedUsers: activeUsers });
    debugLog('Saved filtered muted users list');
  }

  return activeUsers;
}

// Unmute a user
async function unmuteUser(userName) {
  const data = await browserAPI.storage.local.get('mutedUsers');
  const mutedUsers = data.mutedUsers || [];

  const filtered = mutedUsers.filter(u => u.name.toLowerCase() !== userName.toLowerCase());
  await browserAPI.storage.local.set({ mutedUsers: filtered });
  await syncToCloud();
  debugLog(`Unmuted user: ${userName}`);
}

// Notify all Haiilo tabs to refresh their filter
async function notifyAllHaiiloTabs() {
  const tabs = await browserAPI.tabs.query({});
  for (const tab of tabs) {
    if (await isHaiiloTab(tab)) {
      browserAPI.tabs.sendMessage(tab.id, { action: 'refreshFilter' }).catch(() => {});
    }
  }
}

// Broadcast a message to all Haiilo tabs
async function broadcastMessageToAllHaiiloTabs(message) {
  const tabs = await browserAPI.tabs.query({});
  for (const tab of tabs) {
    if (await isHaiiloTab(tab)) {
      browserAPI.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  }
}

// Update badges for all Haiilo tabs based on extensionEnabled setting
async function updateAllBadges() {
  if (!badgeAPI || typeof badgeAPI.setBadgeText !== 'function') return;
  const settings = (await browserAPI.storage.local.get('settings')).settings || DEFAULT_SETTINGS;
  const tabs = await browserAPI.tabs.query({});
  for (const tab of tabs) {
    if (await isHaiiloTab(tab)) {
      if (settings.extensionEnabled === false || await isTabDomainDisabled(tab)) {
        badgeAPI.setBadgeText({ text: 'OFF', tabId: tab.id });
        badgeAPI.setBadgeBackgroundColor({ color: '#888888', tabId: tab.id });
      } else {
        // Query tab for hidden count, if not available, clear badge
        try {
          const response = await browserAPI.tabs.sendMessage(tab.id, { action: 'getHiddenCount' }).catch(() => null);
          if (response && typeof response.count === 'number' && response.count > 0) {
            badgeAPI.setBadgeText({ text: response.count.toString(), tabId: tab.id });
            badgeAPI.setBadgeBackgroundColor({ color: '#6366f1', tabId: tab.id });
          } else {
            badgeAPI.setBadgeText({ text: '', tabId: tab.id });
          }
        } catch (e) {
          badgeAPI.setBadgeText({ text: '', tabId: tab.id });
        }
      }
    } else {
      badgeAPI.setBadgeText({ text: '', tabId: tab.id });
    }
  }
}

// Get all domains (default + custom)
async function getAllDomains() {
  const data = await browserAPI.storage.local.get('customDomains');
  const customDomains = data.customDomains || [];
  return [...DEFAULT_DOMAINS, ...customDomains];
}

// Check if a tab is a Haiilo tab
async function isHaiiloTab(tab) {
  if (!tab || !tab.url) return false;

  try {
    const allDomains = await getAllDomains();
    const url = new URL(tab.url);

    return allDomains.some(domain => {
      return url.hostname === domain || url.hostname.endsWith('.' + domain);
    });
  } catch (e) {
    debugLog('Error parsing URL in isHaiiloTab:', tab.url, e);
    return false;
  }
}

// Add a custom domain (permission must be granted before calling this)
async function addCustomDomain(domain) {
  const data = await browserAPI.storage.local.get('customDomains');
  const customDomains = data.customDomains || [];

  if (customDomains.includes(domain)) {
    throw new Error('Domain already exists');
  }

  try {
    customDomains.push(domain);
    await browserAPI.storage.local.set({ customDomains });
    debugLog(`Added custom domain: ${domain}`);

    // Rebuild context menu to include new domain in targetUrlPatterns
    await createContextMenu();

    // Register dynamic content scripts for the new domain
    await registerDynamicContentScripts();

    // Inject content scripts into existing tabs with this domain
    await injectContentScripts();
  } catch (error) {
    console.error(`Error adding domain ${domain}:`, error);
    throw error;
  }
}

// Remove a custom domain (permissions should be removed by the options page before calling this)
async function removeCustomDomain(domain) {
  const data = await browserAPI.storage.local.get(['customDomains', 'disabledDomains']);
  const customDomains = data.customDomains || [];
  const disabledDomains = data.disabledDomains || [];

  const filtered = customDomains.filter(d => d !== domain);
  const remainingDisabled = disabledDomains.filter(d => d !== domain);
  await browserAPI.storage.local.set({ customDomains: filtered, disabledDomains: remainingDisabled });

  // Rebuild context menu to remove domain from targetUrlPatterns
  await createContextMenu();

  // Re-register dynamic content scripts (this will unregister the removed domain)
  await registerDynamicContentScripts();

  debugLog(`Removed custom domain: ${domain}`);
}

// Enable or disable the extension for a single Haiilo domain. Disabled domains
// are stored in `disabledDomains` so each site remembers its own state.
async function setDomainEnabled(domain, enabled) {
  const data = await browserAPI.storage.local.get('disabledDomains');
  const disabledDomains = data.disabledDomains || [];
  const idx = disabledDomains.indexOf(domain);

  if (enabled && idx >= 0) {
    disabledDomains.splice(idx, 1);
  } else if (!enabled && idx < 0) {
    disabledDomains.push(domain);
  } else {
    return; // state already matches
  }

  await browserAPI.storage.local.set({ disabledDomains });
  debugLog(`Domain ${enabled ? 'enabled' : 'disabled'}: ${domain}`);
}

// Check whether a tab's hostname is a domain the user disabled.
async function isTabDomainDisabled(tab) {
  if (!tab || !tab.url) return false;
  const data = await browserAPI.storage.local.get('disabledDomains');
  const disabledDomains = data.disabledDomains || [];
  if (disabledDomains.length === 0) return false;
  try {
    const hostname = new URL(tab.url).hostname;
    return disabledDomains.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch (e) {
    return false;
  }
}

// Register dynamic content scripts for custom domains
// This ensures content scripts automatically run on custom domains without manual injection
//
// Why this is needed:
// - Default domains (*.haiilo.app, *.haiilo.com) use host_permissions in manifest.json
// - Custom domains use optional_host_permissions which require dynamic registration
// - Dynamic registrations don't persist across browser restarts, so we re-register on startup
//
// Privacy & Compliance:
// - Only registers scripts for domains where user explicitly granted permission
// - Follows principle of least privilege (no blanket access to all sites)
// - Content scripts only run on Haiilo instances, not arbitrary websites
async function registerDynamicContentScripts() {
  try {
    // First, unregister all existing dynamic scripts to avoid duplicates
    const existingScripts = await browserAPI.scripting.getRegisteredContentScripts();
    if (existingScripts.length > 0) {
      await browserAPI.scripting.unregisterContentScripts();
      debugLog('Unregistered existing content scripts:', existingScripts.map(s => s.id));
    }

    // Get custom domains only (default domains use host_permissions)
    const data = await browserAPI.storage.local.get('customDomains');
    const customDomains = data.customDomains || [];

    if (customDomains.length === 0) {
      debugLog('No custom domains to register');
      return;
    }

    // Register a content script for each custom domain
    // We need to check permissions before registering
    for (const domain of customDomains) {
      const origins = [
        `https://*.${domain}/*`,
        `https://${domain}/*`,
        `http://*.${domain}/*`,
        `http://${domain}/*`
      ];

      // Check if we have permission for this domain
      const hasPermission = await browserAPI.permissions.contains({ origins });

      if (!hasPermission) {
        debugLog(`No permission for domain ${domain}, skipping registration`);
        continue;
      }

      try {
        await browserAPI.scripting.registerContentScripts([
          {
            id: `haiilo-enhancer-${domain}`,
            matches: origins,
            js: ['shared.js', 'i18n.js', 'content.js'],
            css: ['content.css'],
            runAt: 'document_idle'
          }
        ]);
        debugLog(`Registered content script for custom domain: ${domain}`);
      } catch (error) {
        console.error(`Failed to register content script for ${domain}:`, error);
      }
    }

    debugLog(`Dynamic content scripts registered for ${customDomains.length} custom domains`);
  } catch (error) {
    console.error('Error registering dynamic content scripts:', error);
  }
}

// Inject content scripts into all Haiilo tabs
async function injectContentScripts() {
  const tabs = await browserAPI.tabs.query({});

  for (const tab of tabs) {
    if (await isHaiiloTab(tab)) {
      try {
        await browserAPI.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['shared.js', 'i18n.js', 'content.js']
        });

        await browserAPI.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        });

        debugLog(`Injected content script into tab ${tab.id}`);
      } catch (e) {
        // Tab might not allow script injection (e.g., chrome:// pages)
        debugLog(`Could not inject into tab ${tab.id}:`, e.message);
      }
    }
  }
}

// Set custom homepage for a specific base URL
async function setCustomHomepage(baseUrl, homepageUrl) {
  const data = await browserAPI.storage.local.get('customHomepages');
  const customHomepages = data.customHomepages || {};

  customHomepages[baseUrl] = homepageUrl;
  await browserAPI.storage.local.set({ customHomepages });

  debugLog(`Set custom homepage for ${baseUrl}: ${homepageUrl}`);
}

// Remove custom homepage for a specific base URL
async function removeCustomHomepage(baseUrl) {
  const data = await browserAPI.storage.local.get('customHomepages');
  const customHomepages = data.customHomepages || {};

  delete customHomepages[baseUrl];
  await browserAPI.storage.local.set({ customHomepages });

  debugLog(`Removed custom homepage for ${baseUrl}`);
}

// Handle setting custom homepage from context menu
async function handleSetHomepage(info, tab) {
  try {
    // First check if the link URL is valid (should be /home/*, /pages/*, or /workspaces/*)
    if (info.linkUrl) {
      try {
        const linkUrl = new URL(info.linkUrl);
        const pathname = linkUrl.pathname;

        if (!pathname.startsWith('/home/') &&
            !pathname.startsWith('/pages/') &&
            !pathname.startsWith('/workspaces/')) {
          debugLog('Link URL is not a valid homepage path:', pathname);
          return;
        }
      } catch (e) {
        debugLog('Could not parse link URL:', info.linkUrl);
        return;
      }
    }

    // Ensure content script is injected
    if (await isHaiiloTab(tab)) {
      try {
        await browserAPI.tabs.sendMessage(tab.id, { action: 'ping' }).catch(() => null);
      } catch (pingError) {
        await browserAPI.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['shared.js', 'i18n.js', 'content.js']
        });
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Ask content script for homepage URL from clicked element
    const response = await browserAPI.tabs.sendMessage(tab.id, {
      action: 'getHomepageUrl'
    }).catch(() => null);

    if (response && response.homepageUrl && response.baseUrl) {
      await setCustomHomepage(response.baseUrl, response.homepageUrl);
      debugLog(`Custom homepage set for ${response.baseUrl}: ${response.homepageUrl}`);

      // Show a confirmation toast in the tab where the user right-clicked
      try {
        await browserAPI.tabs.sendMessage(tab.id, { action: 'showHomepageToast' });
        debugLog('Sent showHomepageToast message to tab', tab.id);
      } catch (toastError) {
        debugLog('Could not send homepage toast to tab', tab.id);
      }

      // Notify all tabs of the same instance to update
      const tabs = await browserAPI.tabs.query({});
      for (const t of tabs) {
        if (await isHaiiloTab(t)) {
          const url = new URL(t.url);
          const baseUrl = url.protocol + '//' + url.hostname;
          if (baseUrl === response.baseUrl) {
            browserAPI.tabs.sendMessage(t.id, { action: 'updateHomepageRedirect' }).catch(() => {});
          }
        }
      }
    } else {
      debugLog('Could not determine homepage URL from clicked element');
    }
  } catch (e) {
    console.error('Error setting custom homepage:', e);
  }
}
