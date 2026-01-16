// Background script for Hush for Haiilo (Firefox version)
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
      title: 'Hush for Haiilo',
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
  // Get user name from selection or try to extract from link
  let userName = null;

  if (info.selectionText) {
    userName = info.selectionText.trim();
  } else if (info.linkUrl) {
    // Try to extract username from the page via content script
    try {
      const response = await browserAPI.tabs.sendMessage(tab.id, {
        action: 'getUserNameFromElement'
      });
      if (response && response.userName) {
        userName = response.userName;
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
  const tabs = await browserAPI.tabs.query({ url: ['https://*.haiilo.app/*', 'https://*.haiilo.com/*'] });
  tabs.forEach(tab => {
    browserAPI.tabs.sendMessage(tab.id, { action: 'refreshFilter' }).catch(() => {});
  });
}
