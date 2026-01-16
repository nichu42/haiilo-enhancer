// Background script for Haiilo Enhancer (Firefox version)
// Uses browser.* API with Promises (Firefox native)

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Default settings
const DEFAULT_SETTINGS = {
  defaultMuteDays: 7,
  showMutedIndicator: true,
  hiddenCount: 0
};

// Initialize extension on install
browserAPI.runtime.onInstalled.addListener(async () => {
  // Initialize storage with defaults if not set
  const data = await browserAPI.storage.local.get(['mutedUsers', 'settings']);

  if (!data.mutedUsers) {
    await browserAPI.storage.local.set({ mutedUsers: [] });
  }

  if (!data.settings) {
    await browserAPI.storage.local.set({ settings: DEFAULT_SETTINGS });
  }

  // Create context menu
  createContextMenu();
});

// Create context menu on startup
browserAPI.runtime.onStartup.addListener(() => {
  createContextMenu();
});

function createContextMenu() {
  // Remove existing menu items first
  browserAPI.contextMenus.removeAll().then(() => {
    // Create parent menu
    browserAPI.contextMenus.create({
      id: 'hush-parent',
      title: 'Haiilo Enhancer',
      contexts: ['link', 'selection']
    });

    // Mute permanently
    browserAPI.contextMenus.create({
      id: 'mute-permanent',
      parentId: 'hush-parent',
      title: 'Mute this user permanently',
      contexts: ['link', 'selection']
    });

    // Mute for default days
    browserAPI.contextMenus.create({
      id: 'mute-default',
      parentId: 'hush-parent',
      title: 'Mute for default period',
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
        title: `Mute for ${days} day${days > 1 ? 's' : ''}`,
        contexts: ['link', 'selection']
      });
    });
  });
}

// Handle context menu clicks
browserAPI.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('Context menu clicked:', info);
  
  // Get user name from selection or try to extract from link
  let userName = null;

  // First, ensure content script is injected
  if (await isHaiiloTab(tab)) {
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.log('Content script injected successfully');
    } catch (e) {
      console.log('Could not inject content script:', e.message);
    }
  } else {
    console.log('Not a Haiilo tab, skipping content script injection');
  }

  if (info.selectionText) {
    userName = info.selectionText.trim();
    console.log('Username from selection:', userName);
  } else if (info.linkUrl) {
    // Try to extract username from the page via content script
    try {
      const response = await browserAPI.tabs.sendMessage(tab.id, {
        action: 'getUserNameFromElement'
      });
      if (response && response.userName) {
        userName = response.userName;
        console.log('Username from element:', userName);
      }
    } catch (e) {
      console.error('Could not get username from element:', e);
    }
  }

  if (!userName) {
    // Ask content script for the last right-clicked username
    try {
      const response = await browserAPI.tabs.sendMessage(tab.id, {
        action: 'getLastRightClickedUser'
      });
      if (response && response.userName) {
        userName = response.userName;
        console.log('Username from last right-click:', userName);
      }
    } catch (e) {
      console.error('Could not get last right-clicked user:', e);
    }
  }

  if (!userName) {
    console.log('No username found to mute');
    return;
  }

  // Determine mute duration
  let muteDays = null; // null = permanent
  const data = await browserAPI.storage.local.get('settings');
  const settings = data.settings || DEFAULT_SETTINGS;

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
  browserAPI.tabs.sendMessage(tab.id, { action: 'refreshFilter' });
});

// Mute a user
async function muteUser(userName, days) {
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
  console.log(`Muted user: ${userName}`, days ? `for ${days} days` : 'permanently');
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
      sendResponse(data.settings || DEFAULT_SETTINGS);
    });
    return true;
  }

  if (message.action === 'saveSettings') {
    browserAPI.storage.local.set({ settings: message.settings }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'updateHiddenCount') {
    // Update badge with hidden count
    if (message.count > 0) {
      browserAPI.browserAction.setBadgeText({ text: message.count.toString(), tabId: sender.tab.id });
      browserAPI.browserAction.setBadgeBackgroundColor({ color: '#6366f1', tabId: sender.tab.id });
    } else {
      browserAPI.browserAction.setBadgeText({ text: '', tabId: sender.tab.id });
    }
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getCustomDomains') {
    browserAPI.storage.local.get('customDomains').then(data => {
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
});

// Get active muted users (filter out expired)
async function getMutedUsers() {
  const data = await browserAPI.storage.local.get('mutedUsers');
  let mutedUsers = data.mutedUsers || [];
  const now = Date.now();

  // Filter out expired users
  const activeUsers = mutedUsers.filter(user => {
    if (user.permanent || !user.expiresAt) return true;
    return user.expiresAt > now;
  });

  // Save if we filtered any out
  if (activeUsers.length !== mutedUsers.length) {
    await browserAPI.storage.local.set({ mutedUsers: activeUsers });
  }

  return activeUsers;
}

// Unmute a user
async function unmuteUser(userName) {
  const data = await browserAPI.storage.local.get('mutedUsers');
  const mutedUsers = data.mutedUsers || [];

  const filtered = mutedUsers.filter(u => u.name.toLowerCase() !== userName.toLowerCase());
  await browserAPI.storage.local.set({ mutedUsers: filtered });

  console.log(`Unmuted user: ${userName}`);
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

// Default domains
const DEFAULT_DOMAINS = ['haiilo.app', 'haiilo.com'];

// Get all domains (default + custom)
async function getAllDomains() {
  const data = await browserAPI.storage.local.get('customDomains');
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

// Add a custom domain
async function addCustomDomain(domain) {
  const data = await browserAPI.storage.local.get('customDomains');
  const customDomains = data.customDomains || [];

  if (!customDomains.includes(domain)) {
    // Request permission for this domain
    const granted = await browserAPI.permissions.request({
      origins: [
        `https://*.${domain}/*`,
        `https://${domain}/*`,
        `http://*.${domain}/*`,
        `http://${domain}/*`
      ]
    });

    if (!granted) {
      console.log(`Permission denied for domain: ${domain}`);
      throw new Error('Permission denied for this domain');
    }

    customDomains.push(domain);
    await browserAPI.storage.local.set({ customDomains });
    console.log(`Added custom domain: ${domain}`);
  }
}

// Remove a custom domain
async function removeCustomDomain(domain) {
  const data = await browserAPI.storage.local.get('customDomains');
  const customDomains = data.customDomains || [];

  const filtered = customDomains.filter(d => d !== domain);
  await browserAPI.storage.local.set({ customDomains: filtered });

  // Remove permissions for this domain
  try {
    await browserAPI.permissions.remove({
      origins: [
        `https://*.${domain}/*`,
        `https://${domain}/*`,
        `http://*.${domain}/*`,
        `http://${domain}/*`
      ]
    });
    console.log(`Removed custom domain and permissions: ${domain}`);
  } catch (e) {
    console.log(`Could not remove permissions for ${domain}:`, e.message);
  }
}
