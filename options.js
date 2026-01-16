// Options page script for Hush for Haiilo

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

async function loadSettings() {
  const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });

  document.getElementById('defaultMuteDays').value = settings.defaultMuteDays || 7;
  document.getElementById('showMutedIndicator').checked = settings.showMutedIndicator !== false;
}

function setupEventListeners() {
  // Auto-save on change
  document.getElementById('defaultMuteDays').addEventListener('change', saveSettings);
  document.getElementById('showMutedIndicator').addEventListener('change', saveSettings);

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

async function saveSettings() {
  const settings = {
    defaultMuteDays: parseInt(document.getElementById('defaultMuteDays').value, 10),
    showMutedIndicator: document.getElementById('showMutedIndicator').checked
  };

  await chrome.runtime.sendMessage({ action: 'saveSettings', settings });
  showStatus('Settings saved', 'success');
}

async function exportData() {
  const mutedUsers = await chrome.runtime.sendMessage({ action: 'getMutedUsers' });
  const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });

  const exportObj = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    mutedUsers,
    settings
  };

  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `hush-for-haiilo-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();

  URL.revokeObjectURL(url);
  showStatus('Data exported successfully', 'success');
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.mutedUsers || !Array.isArray(data.mutedUsers)) {
      throw new Error('Invalid file format');
    }

    // Import muted users
    for (const user of data.mutedUsers) {
      await chrome.runtime.sendMessage({
        action: 'muteUser',
        userName: user.name,
        days: user.permanent ? null : Math.ceil((user.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))
      });
    }

    // Import settings if present
    if (data.settings) {
      await chrome.runtime.sendMessage({ action: 'saveSettings', settings: data.settings });
      await loadSettings();
    }

    showStatus(`Imported ${data.mutedUsers.length} muted users`, 'success');
  } catch (err) {
    showStatus('Failed to import data: ' + err.message, 'error');
  }

  // Reset file input
  e.target.value = '';
}

async function clearAllData() {
  if (!confirm('Are you sure you want to remove all muted users? This cannot be undone.')) {
    return;
  }

  const mutedUsers = await chrome.runtime.sendMessage({ action: 'getMutedUsers' });

  for (const user of mutedUsers) {
    await chrome.runtime.sendMessage({ action: 'unmuteUser', userName: user.name });
  }

  showStatus('All muted users have been removed', 'success');
}

function showStatus(message, type) {
  const status = document.getElementById('saveStatus');
  status.textContent = message;
  status.className = `save-status visible ${type}`;

  setTimeout(() => {
    status.classList.remove('visible');
  }, 3000);
}
