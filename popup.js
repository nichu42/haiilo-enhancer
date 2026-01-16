// Popup script for Hush for Haiilo

document.addEventListener('DOMContentLoaded', async () => {
  await loadMutedUsers();
  await loadHiddenCount();
  setupEventListeners();
});

async function loadMutedUsers() {
  const response = await chrome.runtime.sendMessage({ action: 'getMutedUsers' });
  const mutedList = document.getElementById('mutedList');

  if (!response || response.length === 0) {
    mutedList.innerHTML = '<p class="empty-state">No muted users yet. Right-click on a username to mute.</p>';
    return;
  }

  mutedList.innerHTML = response.map(user => createUserElement(user)).join('');

  // Add event listeners to unmute buttons
  mutedList.querySelectorAll('.unmute-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userName = e.target.dataset.user;
      await chrome.runtime.sendMessage({ action: 'unmuteUser', userName });
      await loadMutedUsers();
    });
  });
}

function createUserElement(user) {
  const expiryText = user.permanent
    ? 'Permanently muted'
    : `Expires ${formatExpiry(user.expiresAt)}`;

  const expiryClass = user.permanent ? 'permanent' : '';

  return `
    <div class="muted-user">
      <div class="muted-user-info">
        <div class="muted-user-name" title="${escapeHtml(user.name)}">${escapeHtml(user.name)}</div>
        <div class="muted-user-expiry ${expiryClass}">${expiryText}</div>
      </div>
      <button class="unmute-btn" data-user="${escapeHtml(user.name)}">Unmute</button>
    </div>
  `;
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && (tab.url.includes('haiilo.app') || tab.url.includes('haiilo.com'))) {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getHiddenCount' });
      if (response && typeof response.count === 'number') {
        document.getElementById('hiddenCount').textContent = response.count;
      }
    }
  } catch (e) {
    // Tab might not have content script loaded
    console.log('Could not get hidden count:', e);
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

    await chrome.runtime.sendMessage({
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
    chrome.runtime.openOptionsPage();
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
