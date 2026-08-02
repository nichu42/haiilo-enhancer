// Popup script for Haiilo Enhancer
//# sourceURL=haiilo-enhancer/popup.js

// Browser API compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
const t = (key, substitutions) => i18nMessage(key, substitutions);

const DEFAULT_DOMAINS = ['haiilo.app', 'haiilo.com'];
const THEME_CYCLE = ['system', 'dark', 'light'];

const UNDO_TOAST_DURATION = 4000;

// Full muted-user list from storage and the current search filter, kept so
// typing in the search box re-renders without another storage round-trip.
let mutedUsersCache = [];
let mutedSearchQuery = '';

// Pending undo state: the reversal of the last mute/unmute, plus the timer
// that auto-hides the toast. `null` means nothing can be undone right now.
let undoState = null;

// The stored preference ('system' | 'light' | 'dark'), tracked so the OS
// theme-change listener knows whether to re-resolve.
let currentThemePreference = 'system';

function applyTheme(theme) {
  // The toggle reflects the stored preference ('system' shows the auto icon);
  // the effective mode on <html> is resolved to light/dark by applyThemeMode.
  const preference = HaiiloShared.resolveThemeMode(theme);
  currentThemePreference = preference;
  HaiiloShared.applyThemeMode(theme);
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.dataset.state = preference;
    const modeLabel = preference === 'system' ? t('themeSystem') : preference === 'light' ? t('themeLight') : t('themeDark');
    const label = `${t('theme')}: ${modeLabel}`;
    toggle.title = label;
    toggle.setAttribute('aria-label', label);
  }
  return preference;
}

function setupThemeToggle() {
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  toggle.addEventListener('click', async () => {
    try {
      const currentSettings = await browserAPI.runtime.sendMessage({ action: 'getSettings' });
      const current = HaiiloShared.resolveThemeMode(currentSettings.theme);
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
      currentSettings.theme = next;
      await browserAPI.runtime.sendMessage({ action: 'saveSettings', settings: currentSettings });
      applyTheme(next);
    } catch (error) {
      console.error('[Popup] Error toggling theme:', error);
    }
  });
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
  await HaiiloI18n.initializeI18n();
  HaiiloI18n.localizeDocument();
  // Display version from manifest
  const manifest = browserAPI.runtime.getManifest();
  const versionEl = document.getElementById('versionInfo');
  if (versionEl) versionEl.textContent = `v${manifest.version}`;

  await loadMutedUsers();
  updateHiddenSummary(0);
  await loadHiddenCount();
  setupHiddenDetailsToggle();
  await loadSettings();
  setupEventListeners();
}

async function loadMutedUsers() {
  const response = await browserAPI.runtime.sendMessage({ action: 'getMutedUsers' });
  mutedUsersCache = Array.isArray(response) ? response : [];
  renderMutedUsers();
}

function renderMutedUsers() {
  const mutedList = document.getElementById('mutedList');
  const searchInput = document.getElementById('mutedSearch');
  mutedList.textContent = '';

  const hasUsers = mutedUsersCache.length > 0;
  if (searchInput) searchInput.hidden = !hasUsers;

  if (!hasUsers) {
    const emptyEl = document.createElement('p');
    emptyEl.className = 'empty-state';
    emptyEl.textContent = t('noMutedUsers');
    mutedList.appendChild(emptyEl);
    return;
  }

  const query = mutedSearchQuery.trim().toLowerCase();
  const filtered = query
    ? mutedUsersCache.filter(user => user.name.toLowerCase().includes(query))
    : mutedUsersCache;

  if (filtered.length === 0) {
    const emptyEl = document.createElement('p');
    emptyEl.className = 'empty-state';
    emptyEl.textContent = t('mutedSearchNoResults');
    mutedList.appendChild(emptyEl);
    return;
  }

  filtered.forEach(user => mutedList.appendChild(createUserElement(user)));

  // Add event listeners to unmute buttons
  mutedList.querySelectorAll('.unmute-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userName = e.currentTarget.dataset.user;
      const user = mutedUsersCache.find(u => u.name === userName);
      await browserAPI.runtime.sendMessage({ action: 'unmuteUser', userName });
      showUndoToast(
        t('unmutedUser', userName),
        { action: 'mute', userName, days: user && !user.permanent ? Math.max(1, Math.ceil((user.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))) : null }
      );
      await loadMutedUsers();
    });
  });
}

function setupMutedSearch() {
  const searchInput = document.getElementById('mutedSearch');
  if (!searchInput) return;
  // P10 fix: debounce to avoid rebuilding DOM on every keystroke
  let searchTimeout = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      mutedSearchQuery = searchInput.value;
      renderMutedUsers();
    }, 150);
  });
}

function hideUndoToast() {
  if (undoState) {
    clearTimeout(undoState.timer);
    undoState = null;
  }
  const toast = document.getElementById('undoToast');
  if (toast) toast.hidden = true;
}

// Show a small floating "Undo" bubble for a few seconds. `undoAction` is the
// reversal of the action just performed: { action: 'mute'|'unmute', userName,
// days } — clicking Undo executes it and clears the toast.
function showUndoToast(message, undoAction) {
  hideUndoToast();
  const toast = document.getElementById('undoToast');
  const messageEl = document.getElementById('undoToastMessage');
  if (!toast || !messageEl) return;
  messageEl.textContent = message;
  toast.hidden = false;
  undoState = {
    ...(undoAction || {}),
    timer: setTimeout(hideUndoToast, UNDO_TOAST_DURATION)
  };
}

function setupUndoButton() {
  const undoBtn = document.getElementById('undoButton');
  if (!undoBtn) return;
  undoBtn.addEventListener('click', async () => {
    const state = undoState;
    hideUndoToast();
    if (!state) return;
    try {
      if (state.action === 'unmute') {
        await browserAPI.runtime.sendMessage({ action: 'unmuteUser', userName: state.userName });
      } else if (state.action === 'mute') {
        await browserAPI.runtime.sendMessage({ action: 'muteUser', userName: state.userName, days: state.days });
      }
    } catch (error) {
      console.error('[Popup] Error undoing last action:', error);
    }
    await loadMutedUsers();
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
  expiryDiv.textContent = user.permanent ? t('permanentlyMuted') : t('expiresIn', formatExpiry(user.expiresAt));

  infoDiv.appendChild(nameDiv);
  infoDiv.appendChild(expiryDiv);

  const btn = document.createElement('button');
  btn.className = 'unmute-btn';
  btn.type = 'button';
  btn.dataset.user = user.name;
  btn.title = t('unmute');
  btn.setAttribute('aria-label', t('unmute'));
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z');
  svg.appendChild(path);
  btn.appendChild(svg);

  div.appendChild(infoDiv);
  div.appendChild(btn);

  return div;
}

function formatExpiry(timestamp) {
  const now = Date.now();
  const diff = timestamp - now;

  if (diff < 0) return t('expired');

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  if (days > 0) {
    return t('inDays', days);
  } else if (hours > 0) {
    return t('inHours', hours);
  } else {
    return t('soon');
  }
}

function updateHiddenSummary(count) {
  const summary = document.getElementById('hiddenSummary');
  if (!summary) return;
  summary.textContent = '';
  const countEl = document.createElement('span');
  countEl.id = 'hiddenCount';
  countEl.textContent = String(count);
  summary.appendChild(countEl);
  summary.appendChild(document.createTextNode(t('itemsHiddenSummary', count).replace(String(count), '')));
}

async function loadHiddenCount() {
  try {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (tab && await isHaiiloUrl(tab.url)) {
      const response = await browserAPI.tabs.sendMessage(tab.id, { action: 'getHiddenCount' });
      if (response && typeof response.count === 'number') {
        document.getElementById('hiddenCount').textContent = response.count;
        updateHiddenSummary(response.count);
        updateHiddenDetailsVisibility(response.count);
      }
    }
  } catch (e) {
    // Tab might not have content script loaded
    debugLog('Could not get hidden count:', e);
  }
}

function updateHiddenDetailsVisibility(count) {
  const details = document.getElementById('hiddenDetails');
  const summary = details ? details.querySelector('.hidden-details-summary') : null;
  const hasHiddenItems = Number(count) > 0;

  if (details) {
    details.hidden = !hasHiddenItems;
    if (summary) {
      summary.setAttribute('aria-disabled', String(!hasHiddenItems));
    }
    if (!hasHiddenItems) {
      details.open = false;
    }
  }
}

function setupHiddenDetailsToggle() {
  const details = document.getElementById('hiddenDetails');
  if (!details) return;

  details.addEventListener('toggle', async () => {
    const count = Number(document.getElementById('hiddenCount')?.textContent || 0);
    if (!details.open || count <= 0) return;
    await loadHiddenDetails();
  });

  if (details.open) {
    loadHiddenDetails();
  }
}

async function loadHiddenDetails() {
  const contentEl = document.getElementById('hiddenDetailsContent');
  if (!contentEl) return;

  const count = Number(document.getElementById('hiddenCount')?.textContent || 0);
  if (count <= 0) return;

  contentEl.textContent = t('loadingHiddenDetails');

  try {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab || !await isHaiiloUrl(tab.url)) {
      contentEl.textContent = '';
      const openMessage = document.createElement('p');
      openMessage.className = 'empty-state';
      openMessage.textContent = t('openHaiiloToViewDetails');
      contentEl.appendChild(openMessage);
      return;
    }

    const response = await browserAPI.tabs.sendMessage(tab.id, { action: 'getHiddenDetails' });
    const items = response && Array.isArray(response.items) ? response.items : [];

    if (items.length === 0) {
      contentEl.textContent = '';
      const nothingMessage = document.createElement('p');
      nothingMessage.className = 'empty-state';
      nothingMessage.textContent = t('nothingHidden');
      contentEl.appendChild(nothingMessage);
      return;
    }

    contentEl.textContent = '';
    items.slice(0, 20).forEach((item, index) => {
      contentEl.appendChild(createHiddenDetailElement(item, index + 1));
    });

    if (items.length > 20) {
      const more = document.createElement('p');
      more.className = 'hidden-details-more';
      more.textContent = t('showingHiddenItems', items.length);
      contentEl.appendChild(more);
    }
  } catch (e) {
    debugLog('Could not load hidden details:', e);
    contentEl.textContent = '';
    const errorMessage = document.createElement('p');
    errorMessage.className = 'empty-state';
    errorMessage.textContent = t('couldNotLoadHiddenDetails');
    contentEl.appendChild(errorMessage);
  }
}

function createHiddenDetailElement(item, index) {
  const card = document.createElement('article');
  card.className = 'hidden-detail-item';

  const title = document.createElement('div');
  title.className = 'hidden-detail-title';

  const indexEl = document.createElement('span');
  indexEl.className = 'hidden-detail-index';
  indexEl.textContent = String(index);

  const kindEl = document.createElement('span');
  kindEl.className = 'hidden-detail-kind';
  kindEl.textContent = item.kind || t('hiddenItem');

  title.appendChild(indexEl);
  title.appendChild(kindEl);

  const authors = document.createElement('div');
  authors.className = 'hidden-detail-authors';
  const authorList = Array.isArray(item.matchedAuthors) ? item.matchedAuthors.filter(Boolean) : [];
  authors.textContent = authorList.length > 0
    ? t('matchedAuthors', authorList.join(' · '))
    : t('mutedUser', item.mutedUser || 'unknown');

  const excerpt = document.createElement('div');
  excerpt.className = 'hidden-detail-excerpt';
  excerpt.textContent = item.excerpt || t('noPreviewAvailable');

  card.appendChild(title);
  card.appendChild(authors);
  card.appendChild(excerpt);

  return card;
}

async function loadSettings() {
  const settings = await browserAPI.runtime.sendMessage({ action: 'getSettings' });

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

  applyTheme(settings.theme);
  updatePopupDisabledState();
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
}

function setupEventListeners() {
  setupThemeToggle();
  setupMutedSearch();
  setupUndoButton();

  // Re-resolve the theme if the OS light/dark setting changes while the popup
  // is open (only matters in 'system' mode).
  HaiiloShared.bindSystemThemeChange(() => {
    if (currentThemePreference === 'system') {
      HaiiloShared.applyThemeMode('system');
    }
  });

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
    showUndoToast(t('mutedUser', userName), { action: 'unmute', userName });
    await loadMutedUsers();
  });

  // Open options
  document.getElementById('openOptions').addEventListener('click', (e) => {
    e.preventDefault();
    browserAPI.runtime.openOptionsPage();
  });
}
