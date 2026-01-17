// Background service worker for Haiilo Enhancer
// Compatible with both Chrome (Manifest V3) and Firefox (Manifest V2)

// Browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Debug logging helper
function debugLog(...args) {
  chrome.storage.local.get('settings').then(data => {
    const settings = data.settings || DEFAULT_SETTINGS;
    if (settings.debugMode) {
      console.log(...args);
    }
  });
}

// Default settings
const DEFAULT_SETTINGS = {
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
  hiddenCount: 0,
  dateFormat: 'MMDD', // 'MMDD', 'DDMM', 'DD.MM', 'DD-MM'
  timeFormat: '12h', // '12h' or '24h'
  keepMessengerExpanded: false, // Keep messenger panel permanently expanded
  adjustLayoutForMessenger: false // Adjust page layout when messenger is expanded
};

// Default domains
const DEFAULT_DOMAINS = ['haiilo.app', 'haiilo.com'];

// Initialize extension on install
chrome.runtime.onInstalled.addListener(async () => {
  // Initialize storage with defaults if not set
  const data = await chrome.storage.local.get(['mutedUsers', 'settings', 'customDomains']);

  if (!data.mutedUsers) {
    await chrome.storage.local.set({ mutedUsers: [] });
  }

  if (!data.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }

  if (!data.customDomains) {
    await chrome.storage.local.set({ customDomains: [] });
  }

  if (!data.customHomepages) {
    await chrome.storage.local.set({ customHomepages: {} });
  }

  // Create context menu
  createContextMenu();

  // Register dynamic content scripts for custom domains
  await registerDynamicContentScripts();

  // Inject content scripts into existing tabs
  await injectContentScripts();
});

// Create context menu on startup and re-register content scripts
chrome.runtime.onStartup.addListener(async () => {
  createContextMenu();

  // Re-register dynamic content scripts (they don't persist across browser restarts)
  await registerDynamicContentScripts();
});

// Inject content script when navigating to Haiilo pages
// Note: Dynamic content scripts handle automatic injection for custom domains
// This listener serves as a fallback and handles default domains
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (await isHaiiloTab({ url: details.url })) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        files: ['content.js']
      });
      debugLog('Content script injected on navigation to:', details.url);
    } catch (e) {
      debugLog('Could not inject content script on navigation:', e.message);
    }
  }
});

async function createContextMenu() {
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
  chrome.contextMenus.removeAll(() => {
    // Create parent menu
    chrome.contextMenus.create({
      id: 'hush-parent',
      title: 'Haiilo Enhancer',
      contexts: ['link', 'selection']
    });

    // Mute permanently
    chrome.contextMenus.create({
      id: 'mute-permanent',
      parentId: 'hush-parent',
      title: 'Mute this user permanently',
      contexts: ['link', 'selection']
    });

    // Mute for default days
    chrome.contextMenus.create({
      id: 'mute-default',
      parentId: 'hush-parent',
      title: 'Mute for default period',
      contexts: ['link', 'selection']
    });

    // Separator
    chrome.contextMenus.create({
      id: 'separator-1',
      parentId: 'hush-parent',
      type: 'separator',
      contexts: ['link', 'selection']
    });

    // Mute for specific durations
    const durations = [1, 3, 7, 14, 30, 90];
    durations.forEach(days => {
      chrome.contextMenus.create({
        id: `mute-${days}`,
        parentId: 'hush-parent',
        title: `Mute for ${days} day${days > 1 ? 's' : ''}`,
        contexts: ['link', 'selection']
      });
    });

    // Separator
    chrome.contextMenus.create({
      id: 'separator-2',
      parentId: 'hush-parent',
      type: 'separator',
      contexts: ['link', 'selection']
    });

    // Set as default homepage (only shown for valid homepage links)
    chrome.contextMenus.create({
      id: 'set-homepage',
      parentId: 'hush-parent',
      title: 'Set as default homepage',
      contexts: ['link'],
      documentUrlPatterns: documentUrlPatterns,
      targetUrlPatterns: targetUrlPatterns
    });
  });
}

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
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
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' }).catch(() => null);
        debugLog('Content script already present');
      } catch (pingError) {
        // Content script not present, inject it
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
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
      const response = await chrome.tabs.sendMessage(tab.id, {
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
      const response = await chrome.tabs.sendMessage(tab.id, {
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
    console.log('No username found to mute');
    return;
  }

  // Determine mute duration
  let muteDays = null; // null = permanent
  const settings = (await chrome.storage.local.get('settings')).settings || DEFAULT_SETTINGS;

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
    await chrome.tabs.sendMessage(tab.id, { action: 'refreshFilter' });
    debugLog('Sent refreshFilter message to tab', tab.id);
  } catch (e) {
    console.error('Failed to send refreshFilter message:', e);
    // Try to inject content script and send message again
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      debugLog('Re-injected content script, trying refresh again');
      await chrome.tabs.sendMessage(tab.id, { action: 'refreshFilter' });
    } catch (retryError) {
      console.error('Failed to refresh after re-injection:', retryError);
    }
  }
});

// Mute a user
async function muteUser(userName, days) {
  debugLog('Muting user:', userName, 'for', days ? `${days} days` : 'permanently');
  const data = await chrome.storage.local.get('mutedUsers');
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

  await chrome.storage.local.set({ mutedUsers });
  debugLog(`Muted user: ${userName}`, days ? `for ${days} days` : 'permanently');
  debugLog('Updated muted users list:', mutedUsers);
}

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    chrome.storage.local.get('settings').then(data => {
      sendResponse(data.settings || DEFAULT_SETTINGS);
    });
    return true;
  }

  if (message.action === 'saveSettings') {
    chrome.storage.local.set({ settings: message.settings }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'resetSettings') {
    chrome.storage.local.set({ settings: DEFAULT_SETTINGS }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'updateHiddenCount') {
    debugLog('Updating badge for tab', sender.tab.id, 'with count', message.count);
    // Update badge with hidden count
    if (message.count > 0) {
      chrome.action.setBadgeText({ text: message.count.toString(), tabId: sender.tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#6366f1', tabId: sender.tab.id });
      debugLog('Badge updated with count:', message.count);
    } else {
      chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
      debugLog('Badge cleared');
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getCustomDomains') {
    chrome.storage.local.get('customDomains').then(data => {
      sendResponse(data.customDomains || []);
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
    chrome.storage.local.get('customHomepages').then(data => {
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
  const data = await chrome.storage.local.get('mutedUsers');
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
    await chrome.storage.local.set({ mutedUsers: activeUsers });
    debugLog('Saved filtered muted users list');
  }

  return activeUsers;
}

// Unmute a user
async function unmuteUser(userName) {
  const data = await chrome.storage.local.get('mutedUsers');
  const mutedUsers = data.mutedUsers || [];

  const filtered = mutedUsers.filter(u => u.name.toLowerCase() !== userName.toLowerCase());
  await chrome.storage.local.set({ mutedUsers: filtered });

  console.log(`Unmuted user: ${userName}`);
}

// Notify all Haiilo tabs to refresh their filter
async function notifyAllHaiiloTabs() {
  const allDomains = await getAllDomains();
  const urlPatterns = allDomains.map(d => `https://*.${d}/*`).concat(allDomains.map(d => `https://${d}/*`));

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (await isHaiiloTab(tab)) {
      chrome.tabs.sendMessage(tab.id, { action: 'refreshFilter' }).catch(() => {});
    }
  }
}

// Get all domains (default + custom)
async function getAllDomains() {
  const data = await chrome.storage.local.get('customDomains');
  const customDomains = data.customDomains || [];
  return [...DEFAULT_DOMAINS, ...customDomains];
}

// Check if a tab is a Haiilo tab
async function isHaiiloTab(tab) {
  if (!tab || !tab.url) return false;

  const allDomains = await getAllDomains();
  const url = new URL(tab.url);

  return allDomains.some(domain => {
    return url.hostname === domain || url.hostname.endsWith('.' + domain);
  });
}

// Add a custom domain (permission must be granted before calling this)
async function addCustomDomain(domain) {
  const data = await chrome.storage.local.get('customDomains');
  const customDomains = data.customDomains || [];

  if (customDomains.includes(domain)) {
    throw new Error('Domain already exists');
  }

  try {
    customDomains.push(domain);
    await chrome.storage.local.set({ customDomains });
    console.log(`Added custom domain: ${domain}`);

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
  const data = await chrome.storage.local.get('customDomains');
  const customDomains = data.customDomains || [];

  const filtered = customDomains.filter(d => d !== domain);
  await chrome.storage.local.set({ customDomains: filtered });

  // Rebuild context menu to remove domain from targetUrlPatterns
  await createContextMenu();

  // Re-register dynamic content scripts (this will unregister the removed domain)
  await registerDynamicContentScripts();

  console.log(`Removed custom domain: ${domain}`);
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
    const existingScripts = await chrome.scripting.getRegisteredContentScripts();
    if (existingScripts.length > 0) {
      await chrome.scripting.unregisterContentScripts();
      debugLog('Unregistered existing content scripts:', existingScripts.map(s => s.id));
    }

    // Get custom domains only (default domains use host_permissions)
    const data = await chrome.storage.local.get('customDomains');
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
      const hasPermission = await chrome.permissions.contains({ origins });

      if (!hasPermission) {
        console.warn(`No permission for domain ${domain}, skipping registration`);
        continue;
      }

      try {
        await chrome.scripting.registerContentScripts([
          {
            id: `haiilo-enhancer-${domain}`,
            matches: origins,
            js: ['content.js'],
            css: ['content.css'],
            runAt: 'document_idle'
          }
        ]);
        console.log(`Registered content script for custom domain: ${domain}`);
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
  const tabs = await chrome.tabs.query({});

  for (const tab of tabs) {
    if (await isHaiiloTab(tab)) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });

        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css']
        });

        console.log(`Injected content script into tab ${tab.id}`);
      } catch (e) {
        // Tab might not allow script injection (e.g., chrome:// pages)
        console.log(`Could not inject into tab ${tab.id}:`, e.message);
      }
    }
  }
}

// Set custom homepage for a specific base URL
async function setCustomHomepage(baseUrl, homepageUrl) {
  const data = await chrome.storage.local.get('customHomepages');
  const customHomepages = data.customHomepages || {};

  customHomepages[baseUrl] = homepageUrl;
  await chrome.storage.local.set({ customHomepages });

  console.log(`Set custom homepage for ${baseUrl}: ${homepageUrl}`);
}

// Remove custom homepage for a specific base URL
async function removeCustomHomepage(baseUrl) {
  const data = await chrome.storage.local.get('customHomepages');
  const customHomepages = data.customHomepages || {};

  delete customHomepages[baseUrl];
  await chrome.storage.local.set({ customHomepages });

  console.log(`Removed custom homepage for ${baseUrl}`);
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
          console.log('Link URL is not a valid homepage path:', pathname);
          return;
        }
      } catch (e) {
        console.log('Could not parse link URL:', info.linkUrl);
        return;
      }
    }

    // Ensure content script is injected
    if (await isHaiiloTab(tab)) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' }).catch(() => null);
      } catch (pingError) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Ask content script for homepage URL from clicked element
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'getHomepageUrl'
    }).catch(() => null);

    if (response && response.homepageUrl && response.baseUrl) {
      await setCustomHomepage(response.baseUrl, response.homepageUrl);
      console.log(`Custom homepage set for ${response.baseUrl}: ${response.homepageUrl}`);

      // Notify all tabs of the same instance to update
      const tabs = await chrome.tabs.query({});
      for (const t of tabs) {
        if (await isHaiiloTab(t)) {
          const url = new URL(t.url);
          const baseUrl = url.protocol + '//' + url.hostname;
          if (baseUrl === response.baseUrl) {
            chrome.tabs.sendMessage(t.id, { action: 'updateHomepageRedirect' }).catch(() => {});
          }
        }
      }
    } else {
      console.log('Could not determine homepage URL from clicked element');
    }
  } catch (e) {
    console.error('Error setting custom homepage:', e);
  }
}
