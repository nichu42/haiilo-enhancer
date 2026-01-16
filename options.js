// Options page script for Haiilo Enhancer

document.addEventListener('DOMContentLoaded', async () => {
  // Display version from manifest
  const manifest = chrome.runtime.getManifest();
  document.getElementById('versionInfo').textContent = `Haiilo Enhancer v${manifest.version}`;

  // Show Chrome-specific warning only on Chrome/Edge
  const isChrome = typeof browser === 'undefined';
  const warningElement = document.getElementById('chromePermissionWarning');
  if (warningElement) {
    warningElement.style.display = isChrome ? 'block' : 'none';
  }

  await loadSettings();
  await loadDomains();
  setupEventListeners();
});

async function loadSettings() {
  const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });

  document.getElementById('defaultMuteDays').value = settings.defaultMuteDays || 7;
  document.getElementById('showMutedIndicator').checked = settings.showMutedIndicator !== false;
  document.getElementById('debugMode').checked = settings.debugMode || false;
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

  // Show/hide channel avatar settings based on checkbox
  toggleChannelAvatarSettings();
  toggleStyleSettings();

  // Generate random initials and color for preview
  generateRandomPreview();
  updatePreview(false); // Don't regenerate color - use the one from generateRandomPreview
}

async function loadDomains() {
  const response = await chrome.runtime.sendMessage({ action: 'getCustomDomains' });
  const domains = response || [];

  const domainsList = document.getElementById('domainsList');

  if (domains.length === 0) {
    domainsList.innerHTML = '<p class="empty-state">No custom domains added. Default: *.haiilo.app and *.haiilo.com</p>';
    return;
  }

  domainsList.innerHTML = domains.map(domain => `
    <div class="domain-item">
      <span class="domain-item-text">${escapeHtml(domain)}</span>
      <button class="danger remove-domain-btn" data-domain="${escapeHtml(domain)}">Remove</button>
    </div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function setupEventListeners() {
  // Auto-save on change
  document.getElementById('defaultMuteDays').addEventListener('change', saveSettings);
  document.getElementById('showMutedIndicator').addEventListener('change', saveSettings);
  document.getElementById('debugMode').addEventListener('change', saveSettings);

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

  // Reset buttons
  document.getElementById('resetRing').addEventListener('click', resetRingSettings);
  document.getElementById('resetSquare').addEventListener('click', resetSquareSettings);
  document.getElementById('resetBadge').addEventListener('click', resetBadgeSettings);

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
    const existingDomains = await chrome.runtime.sendMessage({ action: 'getCustomDomains' });
    if (existingDomains && existingDomains.includes(domain)) {
      showStatus('Domain already exists', 'error');
      return;
    }

    // Request permission directly from user gesture (must be done in options page, not background)
    const granted = await chrome.permissions.request({
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
    const response = await chrome.runtime.sendMessage({ action: 'addCustomDomain', domain });
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
    await chrome.runtime.sendMessage({ action: 'removeCustomDomain', domain });

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
    const hasPermissions = await chrome.permissions.contains(permissionsToRemove);
    console.log(`Domain ${domain} has permissions:`, hasPermissions);

    if (hasPermissions) {
      const removed = await chrome.permissions.remove(permissionsToRemove);
      console.log(`Attempted to remove permissions for ${domain}, result:`, removed);

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

  const settings = {
    defaultMuteDays: parseInt(document.getElementById('defaultMuteDays').value, 10),
    showMutedIndicator: document.getElementById('showMutedIndicator').checked,
    debugMode: document.getElementById('debugMode').checked,
    enhanceChannelAvatars: document.getElementById('enhanceChannelAvatars').checked,
    channelAvatarStyle: document.getElementById('channelAvatarStyle').value,
    channelAvatarRingColor: document.getElementById('channelAvatarRingColor').value,
    channelAvatarRingWidth: parseFloat(document.getElementById('channelAvatarRingWidth').value),
    channelAvatarSquareColor: document.getElementById('channelAvatarSquareColor').value,
    channelAvatarSquareWidth: parseFloat(document.getElementById('channelAvatarSquareWidth').value),
    channelAvatarBadgeSize: parseInt(document.getElementById('channelAvatarBadgeSize').value, 10),
    channelAvatarBadgePosition: document.getElementById('channelAvatarBadgePosition').value,
    channelAvatarColorMode: colorMode,
    channelAvatarFixedColor: document.getElementById('channelAvatarFixedColor').value
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
  a.download = `haiilo-enhancer-backup-${new Date().toISOString().split('T')[0]}.json`;
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

      badge.innerHTML = `
        <svg width="${Math.floor(badgeSize * 0.6)}" height="${Math.floor(badgeSize * 0.6)}" viewBox="0 0 24 24" fill="white" style="display: block;">
          <circle cx="8" cy="8" r="4"/>
          <circle cx="16" cy="8" r="4"/>
          <path d="M12 14c-3 0-5 1.5-5 3v1h10v-1c0-1.5-2-3-5-3z"/>
        </svg>
      `;

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
