// Content script for Haiilo Enhancer

(function() {
  'use strict';

  // Global flag to track if extension context is valid
  let extensionContextValid = true;
  
  // Check if extension context is valid
  function isExtensionContextValid() {
    try {
      // Comprehensive check for extension context
      if (typeof chrome === 'undefined') return false;
      if (typeof chrome.runtime === 'undefined') return false;
      if (typeof chrome.runtime.sendMessage === 'undefined') return false;
      if (!chrome.runtime.id) return false;
      
      // Additional check: try to access a runtime property
      try {
        const id = chrome.runtime.id;
        if (!id || id.length === 0) return false;
      } catch (e) {
        return false;
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }
  
  // Wrap chrome.runtime.sendMessage with context validation
  function safeSendMessage(message) {
    if (!isExtensionContextValid()) {
      debugLog('Cannot send message: extension context invalid');
      return Promise.reject(new Error('Extension context invalidated'));
    }
    
    try {
      return chrome.runtime.sendMessage(message).catch(error => {
        // If we get context invalidation error, mark context as invalid
        if (error && error.message && 
            (error.message.includes('Extension context invalidated') ||
             error.message.includes('Receiving end does not exist'))) {
          extensionContextValid = false;
          debugLog('Extension context invalidated, marking as invalid');
        }
        throw error;
      });
    } catch (e) {
      // Catch synchronous errors
      if (e && e.message && 
          (e.message.includes('Extension context invalidated') ||
           e.message.includes('Receiving end does not exist'))) {
        extensionContextValid = false;
        debugLog('Extension context invalidated (sync error), marking as invalid');
      }
      return Promise.reject(e);
    }
  }

  let mutedUsers = [];
  let hiddenCount = 0;
  let lastRightClickedUser = null;
  let lastRightClickedElement = null;
  let observer = null;
  let debugMode = false;
  let enhanceChannelAvatars = false;
  let channelAvatarsProcessed = false;
  let avatarStyle = 'ring';
  let ringColor = '#502379';
  let ringWidth = 2;
  let squareColor = '#502379';
  let squareWidth = 2;
  let badgeSize = 100; // Percentage (50-150)
  let badgePosition = 'bottom-left'; // 'bottom-left' or 'top-left'
  let colorMode = 'random'; // 'random' or 'fixed'
  let fixedColor = '#0f939d';
  let customHomepageUrl = null;
  let dateFormat = 'MMDD'; // 'MMDD', 'DDMM', 'DD.MM', 'DD-MM'
  let timeFormat = '12h'; // '12h' or '24h'
  let dateTimeProcessed = false;
  let messengerOverlayObserver = null;
  let keepMessengerExpandedActive = false;
  let bodyStyleObserver = null;

  // Debug logging helper
  function debugLog(...args) {
    if (debugMode) {
      console.log(...args);
    }
  }

  // Function to remove Haiilo's body locking styles
  function removeBodyLockStyles() {
    if (!keepMessengerExpandedActive) return;

    const body = document.body;
    const currentStyle = body.getAttribute('style');

    if (currentStyle && (currentStyle.includes('position: fixed') ||
                         currentStyle.includes('overflow: hidden') ||
                         currentStyle.includes('top:'))) {
      console.log('[Content] Removing body lock styles:', currentStyle);
      // Remove the inline style attributes that lock the body
      body.style.position = '';
      body.style.overflow = '';
      body.style.top = '';
      console.log('[Content] Body lock removed');
    }
  }

  // Function to determine if an element is an interactive popup that should be allowed
  function isInteractiveOverlayElement(target) {
    // Check for known interactive popup components
    const interactiveComponents = [
      'coyo-search-quick-search',
      'coyo-quick-search-item',
      'coyo-notification-center',
      'coyo-user-menu',
      'coyo-settings-panel',
      'coyo-create-menu',
      'coyo-dialog',
      'coyo-modal',
      'coyo-dropdown',
      'coyo-tooltip',
      'cat-dialog',
      'cat-modal',
      'cat-dropdown',
      'cat-tooltip',
      'cdk-overlay-connected-position-bounding-box'
    ];

    // Check if target or any parent matches known interactive components
    for (const component of interactiveComponents) {
      if (target.closest(component)) {
        return true;
      }
    }

    // Check for common popup indicators in class names
    const className = target.className || '';
    const popupIndicators = ['popup', 'modal', 'dialog', 'dropdown', 'menu', 'tooltip', 'notification'];
    if (popupIndicators.some(indicator => className.includes(indicator))) {
      return true;
    }

    // Check for interactive role attributes
    const role = target.getAttribute('role');
    const interactiveRoles = ['dialog', 'menu', 'tooltip', 'alertdialog'];
    if (role && interactiveRoles.includes(role)) {
      return true;
    }

    // Check if the element has interactive attributes that suggest it's a popup
    const interactiveAttributes = ['tabindex', 'aria-haspopup', 'aria-expanded'];
    if (interactiveAttributes.some(attr => target.hasAttribute(attr))) {
      return true;
    }

    // Check for common overlay/popup class patterns
    const overlayPatterns = [
      '[class*="overlay"]',
      '[class*="popup"]', 
      '[class*="modal"]',
      '[class*="dialog"]',
      '[class*="dropdown"]',
      '[class*="menu"]',
      '[class*="tooltip"]'
    ];

    for (const pattern of overlayPatterns) {
      if (target.closest(pattern)) {
        return true;
      }
    }

    return false;
  }

  // Function to block overlay click events
  function blockOverlayClicks(e) {
    if (!keepMessengerExpandedActive) return;

    const target = e.target;

    // Check for Angular overlay divs by their inline styles
    // Looking for divs with position:fixed, z-index, and semi-transparent background
    const style = target.getAttribute('style');
    if (style &&
        style.includes('position: fixed') &&
        style.includes('z-index') &&
        (style.includes('background: rgba') || style.includes('background:rgba'))) {
      console.log('[Content] Blocking Angular overlay click');
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      return false;
    }

    // Check if click is on overlay elements with class names
    if (target.classList.contains('cdk-overlay-backdrop') ||
        target.classList.contains('cdk-overlay-dark-backdrop') ||
        target.classList.contains('cdk-overlay-transparent-backdrop') ||
        target.classList.contains('menu-overlay') ||
        target.closest('.cdk-overlay-backdrop') ||
        target.closest('.cdk-overlay-dark-backdrop') ||
        target.closest('.cdk-overlay-transparent-backdrop') ||
        target.closest('.menu-overlay')) {
      console.log('[Content] Blocking overlay click event on:', target.className);
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      return false;
    }

    // Also check if the target or any parent is part of the cdk-overlay-container
    // but NOT part of the messenger panel itself
    const overlayContainer = target.closest('.cdk-overlay-container');
    const messengerPanel = target.closest('coyo-messaging-panel, coyo-messenger, [class*="messaging"], [class*="messenger"]');
    
    // Check if this is an interactive popup/overlay that should be allowed
    const isInteractivePopup = isInteractiveOverlayElement(target);

    if (overlayContainer && !messengerPanel && !isInteractivePopup) {
      console.log('[Content] Blocking click in overlay container but outside messenger and interactive popups');
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      return false;
    }
  }

  // Function to apply CSS for keeping messenger expanded
  function applyMessengerExpandedCSS(expanded, adjustLayout = false) {
    console.log('[Content] applyMessengerExpandedCSS called with expanded =', expanded, 'adjustLayout =', adjustLayout);
    let styleElement = document.getElementById('haiilo-enhancer-messenger-style');

    keepMessengerExpandedActive = expanded;

    if (expanded) {
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'haiilo-enhancer-messenger-style';
        document.head.appendChild(styleElement);
        console.log('[Content] Created new style element');
      }

      // Measure messenger panel width dynamically (only if layout adjustment is enabled)
      let messengerWidth = 400; // Default fallback
      let layoutAdjustmentCSS = '';

      if (adjustLayout) {
        const messengerPanel = document.querySelector('coyo-messaging-panel, coyo-messenger');
        if (messengerPanel) {
          const computedStyle = window.getComputedStyle(messengerPanel);
          messengerWidth = parseFloat(computedStyle.width);
          console.log('[Content] Detected messenger width:', messengerWidth + 'px');
        }

        layoutAdjustmentCSS = `
        /* Prevent horizontal scroll */
        html {
          overflow-x: hidden !important;
        }

        /* Add right margin to body to prevent content from going under messenger */
        body {
          margin-right: ${messengerWidth}px !important;
          overflow-x: hidden !important;
        }
        `;
      }

      // CSS to disable the blocking backdrop and remove dimming + optional layout adjustment
      styleElement.textContent = `
        /* Make backdrop completely invisible and non-interactive */
        .cdk-overlay-backdrop,
        .cdk-overlay-dark-backdrop,
        .cdk-overlay-transparent-backdrop {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
        }

        /* Make menu overlay completely invisible and non-interactive */
        .menu-overlay {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
        }

        /* Target Angular overlay divs with ng-trigger-openClose */
        div[class*="ng-trigger-openClose"] {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
        }

        /* Target fixed position divs with rgba background (Angular overlays) */
        div[style*="position: fixed"][style*="rgba"] {
          display: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
          visibility: hidden !important;
        }

        /* Exclude interactive popups and overlays from being hidden */
        /* Search popups */
        coyo-search-quick-search,
        coyo-search-quick-search *,
        coyo-quick-search-item,
        coyo-quick-search-item *,
        /* Notification centers */
        coyo-notification-center,
        coyo-notification-center *,
        /* User menus and settings */
        coyo-user-menu,
        coyo-user-menu *,
        coyo-settings-panel,
        coyo-settings-panel *,
        /* Dialogs and modals */
        coyo-dialog,
        coyo-dialog *,
        coyo-modal,
        coyo-modal *,
        cat-dialog,
        cat-dialog *,
        cat-modal,
        cat-modal *,
        /* Dropdowns and tooltips */
        coyo-dropdown,
        coyo-dropdown *,
        coyo-tooltip,
        coyo-tooltip *,
        cat-dropdown,
        cat-dropdown *,
        cat-tooltip,
        cat-tooltip *,
        /* Create menus */
        coyo-create-menu,
        coyo-create-menu * {
          display: revert !important;
          opacity: revert !important;
          pointer-events: revert !important;
          visibility: revert !important;
        }

        ${layoutAdjustmentCSS}
      `;
      console.log('[Content] Applied CSS to remove overlays and adjust layout');

      // Remove any existing body lock styles
      removeBodyLockStyles();

      // Set up click event blockers on capture phase (before other handlers)
      // Use multiple event types to catch all possible interaction methods
      document.addEventListener('click', blockOverlayClicks, true);
      document.addEventListener('mousedown', blockOverlayClicks, true);
      document.addEventListener('mouseup', blockOverlayClicks, true);
      document.addEventListener('pointerdown', blockOverlayClicks, true);
      document.addEventListener('pointerup', blockOverlayClicks, true);
      console.log('[Content] Added click event blockers');

      // Set up MutationObserver to watch for body style changes
      if (!bodyStyleObserver) {
        bodyStyleObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
              console.log('[Content] Body style changed, removing lock');
              removeBodyLockStyles();
            }
          }
        });

        bodyStyleObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ['style']
        });
        console.log('[Content] Set up body style observer');
      }

      debugLog('Applied CSS and body unlock for messenger expansion');
    } else {
      // Clean up when feature is disabled
      if (styleElement) {
        styleElement.remove();
        console.log('[Content] Removed messenger expanded CSS');
      }

      // Remove event listeners
      document.removeEventListener('click', blockOverlayClicks, true);
      document.removeEventListener('mousedown', blockOverlayClicks, true);
      console.log('[Content] Removed click event blockers');

      if (bodyStyleObserver) {
        bodyStyleObserver.disconnect();
        bodyStyleObserver = null;
        console.log('[Content] Disconnected body style observer');
      }

      debugLog('Removed messenger expanded CSS and observer');
    }
  }

  // Apply styling to avatar based on selected style
  function applyAvatarStyle(iconContainer) {
    switch (avatarStyle) {
      case 'ring':
        // Ring border around circle
        iconContainer.style.boxShadow = `0 0 0 ${ringWidth}px ${ringColor}`;
        iconContainer.style.borderRadius = '50%';
        break;

      case 'square':
        // Rounded square with colored border
        iconContainer.style.borderRadius = '20%';
        iconContainer.style.boxShadow = `0 0 0 ${squareWidth}px ${squareColor}`;
        break;

      case 'badge':
        // Small group icon badge overlay
        iconContainer.style.boxShadow = 'none';
        iconContainer.style.borderRadius = '50%';
        iconContainer.style.position = 'relative';

        // Create a small badge indicator
        const badge = document.createElement('div');
        const baseBadgeSize = 17; // Base size in pixels (120% of old 14px size)
        const actualBadgeSize = Math.round(baseBadgeSize * (badgeSize / 100));
        const svgSize = Math.floor(actualBadgeSize * 0.6);

        // Determine position CSS
        const positionCSS = badgePosition === 'top-left'
          ? 'top: -2px; left: -2px;'
          : 'bottom: -2px; left: -2px;';

        badge.style.cssText = `
          position: absolute;
          ${positionCSS}
          width: ${actualBadgeSize}px;
          height: ${actualBadgeSize}px;
          background-color: ${ringColor};
          border-radius: 50%;
          border: 2px solid white;
          display: flex;
          align-items: center;
          justify-content: center;
        `;

        // Add group icon (two overlapping circles representing people)
        badge.innerHTML = `
          <svg width="${svgSize}" height="${svgSize}" viewBox="0 0 24 24" fill="white" style="display: block;">
            <circle cx="8" cy="8" r="4"/>
            <circle cx="16" cy="8" r="4"/>
            <path d="M12 14c-3 0-5 1.5-5 3v1h10v-1c0-1.5-2-3-5-3z"/>
          </svg>
        `;
        iconContainer.appendChild(badge);
        break;

      default:
        // Default to ring
        iconContainer.style.boxShadow = `0 0 0 ${ringWidth}px ${ringColor}`;
        iconContainer.style.borderRadius = '50%';
    }
  }

  // Generate avatar from channel name
  function generateChannelAvatar(channelName) {
    if (!channelName || channelName.trim() === '') {
      return null;
    }

    // Clean the channel name: remove emojis and special characters
    const cleanName = channelName.trim().replace(/[^\p{L}\p{N}\s]/gu, '');
    
    // Extract initials
    const words = cleanName.split(/\s+/).filter(word => word.length > 0);
    let initials = '';
    
    if (words.length === 0) {
      // Fallback: take first 2 alphanumeric characters from original
      const matches = channelName.match(/[\p{L}\p{N}]/gu);
      if (matches && matches.length >= 2) {
        initials = matches.slice(0, 2).join('').toUpperCase();
      } else if (matches && matches.length === 1) {
        initials = matches[0].toUpperCase() + matches[0].toUpperCase();
      } else {
        initials = '??';
      }
    } else if (words.length === 1) {
      // Single word: take first 2 letters
      initials = words[0].substring(0, 2).toUpperCase();
    } else {
      // Multiple words: take first letter of each of first 2 words
      initials = (words[0][0] + words[1][0]).toUpperCase();
    }

    // Generate color based on settings
    let color;
    if (colorMode === 'fixed') {
      color = fixedColor;
    } else {
      // Generate random color based on channel name
      let hash = 0;
      for (let i = 0; i < channelName.length; i++) {
        hash = channelName.charCodeAt(i) + ((hash << 5) - hash);
      }

      const hue = Math.abs(hash) % 360;
      color = `hsl(${hue}, 70%, 60%)`;
    }

    // Determine text color based on background brightness (luminance calculation)
    const getTextColor = (bgColor) => {
      // Parse color - handle both hex and hsl
      let r, g, b;

      if (bgColor.startsWith('#')) {
        // Hex color
        r = parseInt(bgColor.slice(1, 3), 16);
        g = parseInt(bgColor.slice(3, 5), 16);
        b = parseInt(bgColor.slice(5, 7), 16);
      } else if (bgColor.startsWith('hsl')) {
        // HSL color - for our generated colors
        // Extract hue from hsl(hue, sat%, light%)
        const hslMatch = bgColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (hslMatch) {
          const h = parseInt(hslMatch[1]) / 360;
          const s = parseInt(hslMatch[2]) / 100;
          const l = parseInt(hslMatch[3]) / 100;

          // Convert HSL to RGB
          const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
          };

          const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          const p = 2 * l - q;
          r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
          g = Math.round(hue2rgb(p, q, h) * 255);
          b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
        }
      }

      // Calculate relative luminance (WCAG formula)
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      // Use black text for light backgrounds, white for dark
      return luminance > 0.5 ? '#000000' : '#ffffff';
    };

    const textColor = getTextColor(color);

    return {
      initials: initials,
      color: color,
      textColor: textColor
    };
  }


  // Replace generic group icons with generated avatars
  function replaceChannelAvatars() {
    if (!enhanceChannelAvatars) {
      debugLog('Channel avatar enhancement disabled');
      return;
    }
    
    // Only skip if we've already processed and there are existing avatars
    if (channelAvatarsProcessed) {
      const existingAvatars = document.querySelectorAll('coyo-messaging-channel-list-entry .empty-avatar > div[style*="borderRadius"], coyo-messaging-user-avatar .empty-avatar > div[style*="borderRadius"]');
      if (existingAvatars.length > 0) {
        debugLog('Channel avatars already processed and found existing custom avatars');
        return;
      }
      // If no existing custom avatars found, proceed with processing
      debugLog('Channel avatars flag was set but no custom avatars found, reprocessing...');
    }

    debugLog('Looking for channel avatars to replace...');
    const channelEntries = document.querySelectorAll('coyo-messaging-channel-list-entry');

    // Also replace header avatars
    replaceHeaderAvatars();
    
    channelEntries.forEach(entry => {
      const avatarWrapper = entry.querySelector('.avatar-wrapper');
      if (!avatarWrapper) return;

      const genericIcon = avatarWrapper.querySelector('cui-icon[name="group"]');
      if (!genericIcon) return;

      // Get channel name from title attribute
      const titleElement = entry.querySelector('[title]');
      if (!titleElement || !titleElement.title) return;

      const channelName = titleElement.title;
      debugLog('Found channel:', channelName);

      // Generate avatar
      const avatarInfo = generateChannelAvatar(channelName);
      if (!avatarInfo) return;

      // Don't create a new element - modify the existing .empty-avatar container
      const iconContainer = genericIcon.closest('.empty-avatar');
      if (iconContainer) {
        // Remove the cui-icon element
        genericIcon.remove();

        // Apply selected avatar style to distinguish group chats from individual users
        applyAvatarStyle(iconContainer);
        iconContainer.style.backgroundColor = avatarInfo.color;

        // Create and add the initials span (matching user avatar structure exactly)
        const initialsSpan = document.createElement('span');
        initialsSpan.textContent = avatarInfo.initials;
        initialsSpan.className = 'ng-star-inserted';
        // Let the span inherit Haiilo's default styling - don't override font

        iconContainer.appendChild(initialsSpan);

        debugLog('Replaced avatar for:', channelName, 'with initials:', avatarInfo.initials);
      }
    });

    // Only mark as processed if we actually found and replaced avatars
    const replacedAvatars = document.querySelectorAll('coyo-messaging-channel-list-entry .empty-avatar > div[style*="borderRadius"], coyo-messaging-user-avatar .empty-avatar > div[style*="borderRadius"]');
    if (replacedAvatars.length > 0) {
      channelAvatarsProcessed = true;
      debugLog('Channel avatars processing completed, found', replacedAvatars.length, 'custom avatars');
    } else {
      debugLog('No channel avatars were replaced this time');
    }
  }

  // Replace generic group icons in chat headers with generated avatars
  function replaceHeaderAvatars() {
    if (!enhanceChannelAvatars) {
      debugLog('Channel avatar enhancement disabled');
      return;
    }

    debugLog('Looking for header avatars to replace...');
    const headerAvatars = document.querySelectorAll('coyo-messaging-user-avatar .empty-avatar cui-icon[name="group"]');

    headerAvatars.forEach(icon => {
      // Get channel name from title attribute
      const titleElement = icon.closest('[title]');
      if (!titleElement || !titleElement.title) return;

      const channelName = titleElement.title;
      debugLog('Found header avatar for channel:', channelName);

      // Generate avatar
      const avatarInfo = generateChannelAvatar(channelName);
      if (!avatarInfo) return;

      // Don't create a new element - modify the existing .empty-avatar container
      const iconContainer = icon.closest('.empty-avatar');
      if (iconContainer) {
        // Remove the cui-icon element
        icon.remove();

        // Apply selected avatar style to distinguish group chats from individual users
        applyAvatarStyle(iconContainer);
        iconContainer.style.backgroundColor = avatarInfo.color;

        // Create and add the initials span (matching user avatar structure exactly)
        const initialsSpan = document.createElement('span');
        initialsSpan.textContent = avatarInfo.initials;
        initialsSpan.className = 'ng-star-inserted';
        // Let the span inherit Haiilo's default styling - don't override font

        iconContainer.appendChild(initialsSpan);

        debugLog('Replaced header avatar for:', channelName, 'with initials:', avatarInfo.initials);
      }
    });
  }

  // Initialize
  init();

  async function init() {
    try {
      debugLog('Content script initialized');
      // Reset the processed flag on each initialization
      channelAvatarsProcessed = false;
      await loadSettings();
      await loadMutedUsers();
      await loadCustomHomepage();
      setupMutationObserver();
      setupRightClickListener();
      setupLogoClickInterceptor();
      hideContent();
      
      // Add periodic checking for dynamically loaded content
      const periodicCheck = () => {
        // Check if extension context is still valid
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          hideContent();
        } else {
          debugLog('Extension context invalidated, stopping periodic checks');
          // Clear the interval if context is invalid
          return false;
        }
        return true;
      };
      
      const checkInterval = setInterval(() => {
        if (!periodicCheck()) {
          clearInterval(checkInterval);
        }
      }, 2000); // Check every 2 seconds
      debugLog('Started periodic content checking every 2 seconds');
      
      // Replace generic channel avatars and process date/times
      setTimeout(() => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          replaceChannelAvatars();
          replaceHeaderAvatars();
          processAllDateTimes();
        } else {
          debugLog('Extension context invalidated, skipping channel avatar replacement and date/time processing');
        }
      }, 1000); // Give page a moment to load
    } catch (e) {
      console.error('Error initializing content script:', e);
    }

    // Listen for messages from background script
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
          debugLog('Content script received message:', message.action);
        
          if (message.action === 'refreshFilter') {
            debugLog('Refreshing filter...');
            loadMutedUsers().then(() => {
              debugLog('Muted users loaded:', mutedUsers);
              // Only show all content if we actually have muted users
              if (mutedUsers.length > 0) {
                showAllContent();
                hideContent();
              }
              debugLog('Filter refresh complete');
              sendResponse({ success: true });
            }).catch(error => {
              console.error('Error refreshing filter:', error);
              sendResponse({ success: false, error: error.message });
            });
            return true; // Keep message port open for async response
          }

          if (message.action === 'getHiddenCount') {
            sendResponse({ count: hiddenCount });
          }

          if (message.action === 'getLastRightClickedUser') {
            sendResponse({ userName: lastRightClickedUser });
          }

          if (message.action === 'ping') {
            // Simple ping response to check if content script is alive
            sendResponse({ status: 'active' });
            return true;
          }

          if (message.action === 'getUserNameFromElement') {
            // Try to find username from the currently focused or clicked element
            const activeElement = document.activeElement;
            const userName = findUserNameFromElement(activeElement) || lastRightClickedUser;
            sendResponse({ userName: userName });
          }

          if (message.action === 'getHomepageUrl') {
            // Extract homepage URL from last right-clicked element
            const homepageInfo = getHomepageFromElement(lastRightClickedElement);
            sendResponse(homepageInfo);
          }

          if (message.action === 'updateHomepageRedirect') {
            // Reload custom homepage setting
            loadCustomHomepage();
            sendResponse({ success: true });
          }

          if (message.action === 'toggleMessengerExpanded') {
            // Toggle messenger expanded state
            console.log('Content script received toggleMessengerExpanded:', message.expanded, 'adjustLayout:', message.adjustLayout);
            applyMessengerExpandedCSS(message.expanded, message.adjustLayout);
            console.log('Applied messenger expanded CSS for:', message.expanded, 'with layout adjustment:', message.adjustLayout);
            sendResponse({ success: true });
          }
        } catch (e) {
          console.error('Error in message handler:', e);
          sendResponse({ success: false, error: e.message });
        }
      });
    } else {
      console.warn('chrome.runtime.onMessage not available, message handling disabled');
    }
  }

  async function loadSettings() {
    try {
      if (isExtensionContextValid()) {
        try {
          const settings = await safeSendMessage({ action: 'getSettings' });
          debugMode = settings.debugMode || false;
          enhanceChannelAvatars = settings.enhanceChannelAvatars !== false; // Default to true
          avatarStyle = settings.channelAvatarStyle || 'ring';
          ringColor = settings.channelAvatarRingColor || '#502379';
          ringWidth = settings.channelAvatarRingWidth !== undefined ? settings.channelAvatarRingWidth : 2;
          squareColor = settings.channelAvatarSquareColor || '#502379';
          squareWidth = settings.channelAvatarSquareWidth !== undefined ? settings.channelAvatarSquareWidth : 2;
          badgeSize = settings.channelAvatarBadgeSize || 100;
          badgePosition = settings.channelAvatarBadgePosition || 'bottom-left';
          colorMode = settings.channelAvatarColorMode || 'random';
          fixedColor = settings.channelAvatarFixedColor || '#0f939d';
          dateFormat = settings.dateFormat || 'MMDD';
          timeFormat = settings.timeFormat || '12h';
          console.log('[Content] keepMessengerExpanded setting:', settings.keepMessengerExpanded);
          console.log('[Content] adjustLayoutForMessenger setting:', settings.adjustLayoutForMessenger);
          if (settings.keepMessengerExpanded) {
            console.log('[Content] Applying messenger expanded CSS on page load');
            applyMessengerExpandedCSS(true, settings.adjustLayoutForMessenger || false);
          }
          debugLog('Debug mode:', debugMode);
          debugLog('Enhance channel avatars:', enhanceChannelAvatars);
          debugLog('Avatar style:', avatarStyle, 'Ring:', ringColor, ringWidth, 'Square:', squareColor, squareWidth, 'Badge:', badgeSize, badgePosition);
          debugLog('Color mode:', colorMode, 'Fixed color:', fixedColor);
          debugLog('Date format:', dateFormat, 'Time format:', timeFormat);
        } catch (error) {
          // safeSendMessage already handles context errors
          console.error('Failed to load settings:', error);
          debugMode = false;
          enhanceChannelAvatars = true; // Default to enabled
          avatarStyle = 'ring';
          ringColor = '#502379';
          ringWidth = 2;
          squareColor = '#502379';
          squareWidth = 2;
          badgeSize = 100;
          badgePosition = 'bottom-left';
          colorMode = 'random';
          fixedColor = '#0f939d';
        }
      } else {
        debugLog('Cannot load settings: extension context invalid');
        debugMode = false;
        enhanceChannelAvatars = true; // Default to enabled
        avatarStyle = 'ring';
        ringColor = '#502379';
        ringWidth = 2;
        squareColor = '#502379';
        squareWidth = 2;
        badgeSize = 100;
        badgePosition = 'bottom-left';
        colorMode = 'random';
        fixedColor = '#0f939d';
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
      debugMode = false;
      enhanceChannelAvatars = true; // Default to enabled
      avatarStyle = 'ring';
      ringColor = '#502379';
      ringWidth = 2;
      squareColor = '#502379';
      squareWidth = 2;
      badgeSize = 100;
      badgePosition = 'bottom-left';
      colorMode = 'random';
      fixedColor = '#0f939d';
    }
  }

  async function loadMutedUsers() {
    try {
      debugLog('Loading muted users...');
      // Check if chrome.runtime is available
      if (isExtensionContextValid()) {
        try {
          const response = await safeSendMessage({ action: 'getMutedUsers' });
          mutedUsers = Array.isArray(response) ? response : [];
          debugLog('Loaded muted users:', mutedUsers);
        } catch (error) {
          // safeSendMessage already handles context errors
          console.error('Failed to load muted users:', error);
          mutedUsers = [];
        }
      } else {
        debugLog('Cannot load muted users: extension context invalid');
        mutedUsers = [];
      }
    } catch (e) {
      console.error('Failed to load muted users:', e);
      mutedUsers = [];
    }
  }

  function setupMutationObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      let shouldFilter = false;

      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldFilter = true;
          break;
        }
      }

      if (shouldFilter) {
        // Reduce debounce delay for faster response
        clearTimeout(window.hushFilterTimeout);
        window.hushFilterTimeout = setTimeout(() => {
          // Wrap in context check to prevent errors when extension context is invalid
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            debugLog('Mutation detected, re-filtering content');
            hideContent();
            replaceChannelAvatars(); // Also check for new channel avatars
            replaceHeaderAvatars(); // Also check for new header avatars
            processAllDateTimes(); // Also process date/time formats
          } else {
            debugLog('Extension context invalidated, skipping mutation handling');
          }
        }, 50); // Reduced from 100ms to 50ms
      }
    });

    // Observe document.body with subtree for all changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
    
    debugLog('Mutation observer set up');
  }

  function setupRightClickListener() {
    document.addEventListener('contextmenu', (e) => {
      lastRightClickedUser = null;
      lastRightClickedElement = e.target;

      // Try to find username from the clicked element or its ancestors
      const userName = findUserNameFromElement(e.target);
      if (userName) {
        lastRightClickedUser = userName;
        console.log('Right-click detected on user:', userName);
      }
    }, true);
  }

  function findUserNameFromElement(element) {
    // Check if we clicked directly on a user link or within one
    let current = element;
    const maxDepth = 10;
    let depth = 0;

    while (current && depth < maxDepth) {
      // Check for various Haiilo user link patterns

      // Pattern 1: cat-sender-link (timeline posts)
      if (current.tagName === 'CAT-SENDER-LINK') {
        return current.textContent.trim();
      }

      // Pattern 2: data-test="comment-author" (comments)
      if (current.hasAttribute && current.hasAttribute('data-test') &&
          current.getAttribute('data-test') === 'comment-author') {
        return current.textContent.trim();
      }

      // Pattern 3: User profile links
      if (current.tagName === 'A' && current.href) {
        // Check if it's a user profile link
        if (current.href.includes('/user/') || current.href.includes('/profile/')) {
          // Get the text content as the username
          const text = current.textContent.trim();
          if (text && text.length > 0 && text.length < 100) {
            return text;
          }
        }
      }

      // Pattern 4: coyo-user-link or similar custom elements
      if (current.tagName && current.tagName.toLowerCase().includes('user')) {
        const text = current.textContent.trim();
        if (text && text.length > 0 && text.length < 100) {
          return text;
        }
      }

      // Pattern 5: Elements with user-related classes
      if (current.classList) {
        const userClasses = ['author', 'user-name', 'username', 'sender', 'creator'];
        for (const cls of userClasses) {
          if (current.classList.contains(cls) ||
              [...current.classList].some(c => c.includes(cls))) {
            const text = current.textContent.trim();
            if (text && text.length > 0 && text.length < 100) {
              return text;
            }
          }
        }
      }

      current = current.parentElement;
      depth++;
    }

    // If we have selected text, that might be a username
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      return selection.toString().trim();
    }

    return null;
  }

  function isUserMuted(userName) {
    if (!userName) return false;

    const normalizedName = userName.trim();
    return mutedUsers.some(user => user.name.trim() === normalizedName);
  }

  function showAllContent() {
    // Reset only previously hidden content to visible
    // Only reset the specific selectors we actually hide
    document.querySelectorAll('coyo-timeline-item, coyo-comment').forEach(el => {
      if (el.style.display === 'none') {
        el.style.display = '';
      }
    });
    hiddenCount = 0;
  }

  function hideContent() {
    debugLog('Hiding content for muted users:', mutedUsers);
    if (mutedUsers.length === 0) {
      debugLog('No muted users, clearing badge');
      try {
        updateBadge();
      } catch (e) {
        // Final catch-all for any errors in updateBadge
        debugLog('Final catch: Error in updateBadge:', e.message);
      }
      return;
    }

    hiddenCount = 0;
    debugLog('Starting content filtering...');

    // Simple approach like the original working script
    mutedUsers.forEach(user => {
      const userName = user.name.trim();

      // Hide posts by the user (simple selector like original)
      document.querySelectorAll('coyo-timeline-item').forEach(item => {
        const authorLink = item.querySelector('cat-sender-link');
        if (authorLink && authorLink.textContent.trim() === userName) {
          item.style.display = 'none';
          hiddenCount++;
          debugLog('Hidden timeline post by:', userName);
        }
      });

      // Hide comments by the user (simple selector like original)
      document.querySelectorAll('coyo-comment').forEach(comment => {
        const authorLink = comment.querySelector('[data-test="comment-author"]');
        if (authorLink && authorLink.textContent.trim() === userName) {
          comment.style.display = 'none';
          hiddenCount++;
          debugLog('Hidden comment by:', userName);
        }
      });

      // Additional selectors for broader coverage (including dynamically loaded content)
      const additionalSelectors = [
        '[class*="blog-post"]',
        '[class*="article-item"]', 
        '[class*="news-item"]',
        '[class*="feed-item"]',
        '[class*="post-item"]',
        '[class*="activity-item"]'
      ];

      additionalSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(item => {
          // Try multiple author selectors
          const authorSelectors = [
            'cat-sender-link',
            '[data-test="comment-author"]',
            '[class*="author"]',
            '[class*="user-name"]',
            'a[href*="/user/"]',
            'a[href*="/profile/"]'
          ];

          for (const authorSelector of authorSelectors) {
            const authorElement = item.querySelector(authorSelector);
            if (authorElement && authorElement.textContent.trim() === userName) {
              item.style.display = 'none';
              hiddenCount++;
              debugLog('Hidden item (selector:', selector, ') by:', userName);
              break;
            }
          }
        });
      });
    });

    updateBadge();
  }

  // Removed hideElement function - using direct style.display = 'none' like original script

  function updateBadge() {
    try {
      // Check if we're still in a valid extension context
      if (typeof chrome === 'undefined' ||
          typeof chrome.runtime === 'undefined' ||
          typeof chrome.runtime.sendMessage === 'undefined' ||
          !chrome.runtime.id) {
        debugLog('Extension context invalidated, skipping badge update');
        return;
      }

      // Check context first
      if (!isExtensionContextValid()) {
        debugLog('Skipping badge update: extension context invalid');
        return;
      }

      debugLog('Updating badge with count:', hiddenCount);
      safeSendMessage({
        action: 'updateHiddenCount',
        count: hiddenCount
      }).catch(error => {
        // safeSendMessage already handles context errors, so this should only be other errors
        console.error('Failed to update badge:', error);
      });
    } catch (e) {
      console.error('Unexpected error in updateBadge:', e);
    }
  }

  // Load custom homepage URL for current instance
  async function loadCustomHomepage() {
    try {
      if (!isExtensionContextValid()) {
        debugLog('Cannot load custom homepage: extension context invalid');
        return;
      }

      const baseUrl = window.location.protocol + '//' + window.location.hostname;
      const customHomepages = await safeSendMessage({ action: 'getCustomHomepages' });

      if (customHomepages && customHomepages[baseUrl]) {
        customHomepageUrl = customHomepages[baseUrl];
        debugLog('Custom homepage loaded for', baseUrl, ':', customHomepageUrl);
      } else {
        customHomepageUrl = null;
        debugLog('No custom homepage set for', baseUrl);
      }
    } catch (e) {
      console.error('Failed to load custom homepage:', e);
      customHomepageUrl = null;
    }
  }

  // Extract homepage URL from clicked element
  function getHomepageFromElement(element) {
    if (!element) return null;

    const baseUrl = window.location.protocol + '//' + window.location.hostname;

    // Look for homepage navigation links in navbar
    let current = element;
    let depth = 0;
    const maxDepth = 15;

    while (current && depth < maxDepth) {
      // Check if this is an anchor element with href
      if (current.tagName === 'A' && current.href) {
        const url = new URL(current.href);

        // Check if it's a valid homepage path (/home/*, /pages/*, or /workspaces/*)
        if (url.pathname.startsWith('/home/') ||
            url.pathname.startsWith('/pages/') ||
            url.pathname.startsWith('/workspaces/')) {
          debugLog('Found homepage URL:', current.href);
          return {
            homepageUrl: current.href,
            baseUrl: baseUrl
          };
        }
      }

      // Also check for cui-button elements with uisref attribute that might be links
      if (current.hasAttribute && current.hasAttribute('uisref')) {
        const href = current.getAttribute('href');
        if (href && (href.startsWith('/home/') ||
                     href.startsWith('/pages/') ||
                     href.startsWith('/workspaces/'))) {
          const fullUrl = baseUrl + href;
          debugLog('Found homepage URL from uisref:', fullUrl);
          return {
            homepageUrl: fullUrl,
            baseUrl: baseUrl
          };
        }
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  }

  // Setup logo click interceptor
  function setupLogoClickInterceptor() {
    // Intercept clicks on the logo
    document.addEventListener('click', (e) => {
      // Check if we have a custom homepage set
      if (!customHomepageUrl) return;

      // Find if the click was on the logo or its children
      let current = e.target;
      let depth = 0;
      const maxDepth = 10;

      while (current && depth < maxDepth) {
        // Check for the main logo link
        if (current.tagName === 'A' && current.hasAttribute('data-test') &&
            current.getAttribute('data-test') === 'navigation-logo') {
          debugLog('Logo click intercepted, redirecting to custom homepage:', customHomepageUrl);
          e.preventDefault();
          e.stopPropagation();
          window.location.href = customHomepageUrl;
          return;
        }

        // Also check for coyo-main-logo element
        if (current.tagName && current.tagName.toLowerCase() === 'coyo-main-logo') {
          // Find the anchor inside
          const logoLink = current.querySelector('a[data-test="navigation-logo"]');
          if (logoLink && (e.target === logoLink || logoLink.contains(e.target))) {
            debugLog('Logo click intercepted via coyo-main-logo, redirecting to custom homepage:', customHomepageUrl);
            e.preventDefault();
            e.stopPropagation();
            window.location.href = customHomepageUrl;
            return;
          }
        }

        current = current.parentElement;
        depth++;
      }
    }, true); // Use capture phase to intercept before other handlers
  }

  // Convert 12-hour time to 24-hour
  function convert12to24(timeStr) {
    // Match formats like "10:22 PM", "4:30 am", "12:00 AM"
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/i);
    if (!match) return timeStr;

    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3].toUpperCase();

    if (period === 'AM') {
      if (hours === 12) hours = 0;
    } else {
      if (hours !== 12) hours += 12;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  // Convert date format
  function convertDateFormat(dateStr, hasYear = false) {
    // If dateStr contains a year, handle full date
    if (hasYear) {
      const fullDateMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (fullDateMatch) {
        const month = fullDateMatch[1].padStart(2, '0');
        const day = fullDateMatch[2].padStart(2, '0');
        const year = fullDateMatch[3];

        switch (dateFormat) {
          case 'DDMM':
            return `${day}/${month}/${year}`;
          case 'DD.MM':
            return `${day}.${month}.${year}`;
          case 'DD-MM':
            return `${day}-${month}-${year}`;
          default: // MMDD
            return `${month}/${day}/${year}`;
        }
      }

      const shortYearMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
      if (shortYearMatch) {
        const month = shortYearMatch[1].padStart(2, '0');
        const day = shortYearMatch[2].padStart(2, '0');
        const year = shortYearMatch[3];

        switch (dateFormat) {
          case 'DDMM':
            return `${day}/${month}/${year}`;
          case 'DD.MM':
            return `${day}.${month}.${year}`;
          case 'DD-MM':
            return `${day}-${month}-${year}`;
          default: // MMDD
            return `${month}/${day}/${year}`;
        }
      }
    } else {
      // Handle short date (MM/DD)
      const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
      if (slashMatch) {
        const month = slashMatch[1].padStart(2, '0');
        const day = slashMatch[2].padStart(2, '0');

        switch (dateFormat) {
          case 'DDMM':
            return `${day}/${month}`;
          case 'DD.MM':
            return `${day}.${month}`;
          case 'DD-MM':
            return `${day}-${month}`;
          default: // MMDD
            return `${month}/${day}`;
        }
      }
    }

    // Match "Month DD, YYYY" format (e.g., "January 17, 2026")
    const monthNameMatch = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i);
    if (monthNameMatch && (dateFormat === 'DDMM' || dateFormat === 'DD.MM' || dateFormat === 'DD-MM')) {
      const month = monthNameMatch[1];
      const day = monthNameMatch[2];
      const year = monthNameMatch[3];
      return `${day} ${month} ${year}`;
    }

    return dateStr;
  }

  // Simple function to validate short date (MM/DD format)
  function isValidShortDate(month, day) {
    // Month must be 1-12
    if (month < 1 || month > 12) {
      return false;
    }
    
    // Day must be valid for the month (February has 29 days to allow for leap years)
    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const maxDays = daysInMonth[month - 1];
    
    return day >= 1 && day <= maxDays;
  }

  // Process date/time in text nodes
  function processDateTimeInText(node) {
    if (node.nodeType !== Node.TEXT_NODE) return;

    let text = node.textContent;
    let modified = false;

    // Convert times if 24-hour format is enabled
    if (timeFormat === '24h') {
      const newText = text.replace(/\b(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)\b/gi, (match) => {
        modified = true;
        return convert12to24(match);
      });
      text = newText;
    }

    // Convert dates
    if (dateFormat !== 'MMDD') {
      // IMPORTANT: Process full dates FIRST (before short dates) to avoid partial matches

      // Match and convert full dates with year (MM/DD/YYYY)
      text = text.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (match) => {
        modified = true;
        return convertDateFormat(match, true); // hasYear=true
      });

      // Match and convert full dates with 2-digit year (MM/DD/YY)
      text = text.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/g, (match) => {
        modified = true;
        return convertDateFormat(match, true); // hasYear=true
      });

      // Match and convert long date formats (Month DD, YYYY)
      text = text.replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/gi, (match) => {
        modified = true;
        return convertDateFormat(match, true); // hasYear=true
      });

      // Match and convert short date patterns (MM/DD) - process LAST
      // Only match zero-padded dates (01/03) to avoid converting fractions (1/3)
      text = text.replace(/\b(\d{2})\/(\d{2})\b/g, (match, monthStr, dayStr) => {
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);
        
        // Validate that this is actually a valid date
        if (isValidShortDate(month, day)) {
          modified = true;
          return convertDateFormat(match, false); // hasYear=false
        }
        return match; // Don't modify if invalid date
      });
    }

    if (modified) {
      node.textContent = text;
    }
  }

  // Walk through all text nodes and process dates/times
  function processAllDateTimes() {
    if (dateFormat === 'MMDD' && timeFormat === '12h') {
      debugLog('Date/time format matches default, skipping processing');
      return;
    }

    debugLog('Processing date/time formats...');

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip script and style elements
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tagName = parent.tagName.toLowerCase();
          if (tagName === 'script' || tagName === 'style') {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    const nodesToProcess = [];
    while (node = walker.nextNode()) {
      nodesToProcess.push(node);
    }

    nodesToProcess.forEach(processDateTimeInText);
    debugLog('Date/time processing complete');
  }
})();
