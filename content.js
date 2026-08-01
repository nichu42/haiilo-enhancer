// Content script for Haiilo Enhancer
//# sourceURL=haiilo-enhancer/content.js

(function() {
  'use strict';

  // Guard against double injection (can happen when both manifest and background inject)
  if (window.__haiiloEnhancerLoaded) return;
  window.__haiiloEnhancerLoaded = true;

  // Browser API compatibility: browser.* is promise-based in Firefox; chrome.* in Chrome
  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // Global flag to track if extension context is valid
  let extensionContextValid = true;
  
  // Check if extension context is valid
  function isExtensionContextValid() {
    try {
      // Comprehensive check for extension context
      if (typeof browserAPI === 'undefined') return false;
      if (typeof browserAPI.runtime === 'undefined') return false;
      if (typeof browserAPI.runtime.sendMessage === 'undefined') return false;
      if (!browserAPI.runtime.id) return false;
      
      // Additional check: try to access a runtime property
      try {
        const id = browserAPI.runtime.id;
        if (!id || id.length === 0) return false;
      } catch (e) {
        return false;
      }
      
      return extensionContextValid;
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
      return browserAPI.runtime.sendMessage(message).catch(error => {
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
  let hiddenItems = [];
  let lastRightClickedUser = null;
  let lastRightClickedElement = null;
  let observer = null;
  let debugMode = false;
  let extensionEnabled = true;
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
  let dateFormat = 'northAmerican12h'; // locale-aware preset id
  let timeFormat = '12h'; // '12h' or '24h'
  let dateTimeProcessed = false;
  let isTyping = false;
  let messengerOverlayObserver = null;
  let keepMessengerExpandedActive = false;
  let messengerReopenObserver = null;
  let bodyStyleObserver = null;
  let classObserver = null;
  let autoExpandEnabled = false;
  let autoExpandClicksPerList = 3;
  let autoExpandDelayMs = 300;
  let autoExpandScope = 'both';
  let autoExpandMountObserver = null;
  let calendarActionObserver = null;

  // Reaction enhancements
  let sortReactionsByCount = true;
  let showReactionCountTooltip = true;
  let showReactionCountInline = false;
  let reactionTypesCache = null; // { TYPE: { color, unicode } }
  let reactionSenderIdCache = null; // current user ID needed by the summary API
  let reactionEnhancerObserver = null;

  const MESSENGER_PANEL_WIDTH_MIN_PERCENT = 50;
  const MESSENGER_PANEL_WIDTH_MAX_PERCENT = 125;
  const MESSENGER_PANEL_WIDTH_DEFAULT_PERCENT = 100;
  const HAIILO_DEFAULT_MESSENGER_WIDTH_PERCENT = 80;
  const HAIILO_DEFAULT_MESSENGER_MAX_WIDTH_PX = 600;

  function clampMessengerPanelWidthPercent(value) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return MESSENGER_PANEL_WIDTH_DEFAULT_PERCENT;
    return Math.max(MESSENGER_PANEL_WIDTH_MIN_PERCENT, Math.min(MESSENGER_PANEL_WIDTH_MAX_PERCENT, parsed));
  }

  function getMessengerPanelWidthCSS(widthPercent) {
    const clampedPercent = clampMessengerPanelWidthPercent(widthPercent);
    const scale = clampedPercent / 100;
    const scaledWidthPercent = HAIILO_DEFAULT_MESSENGER_WIDTH_PERCENT * scale;
    const scaledMaxWidthPx = HAIILO_DEFAULT_MESSENGER_MAX_WIDTH_PX * scale;

    return `
        /* Scale Haiilo's default open messenger width (80%, capped at 600px) */
        coyo-messaging-sidebar aside.sidebar-container.two-columns,
        coyo-messaging-sidebar aside.sidebar-container.two-c,
        coyo-messaging-panel aside.sidebar-container.two-columns,
        coyo-messaging-panel aside.sidebar-container.two-c {
          width: ${scaledWidthPercent}% !important;
          max-width: ${scaledMaxWidthPx}px !important;
        }
      `;
  }
  // Per-button state. Track whether each show-more button has been
  // processed in this page load, keyed by its data-test value
  // ('show-more-workspace' or 'show-more-page'). Each button is
  // independent - the runner can process workspace and pages at
  // different times because they may appear at different moments
  // as Haiilo re-renders the sidebar.
  const autoExpandProcessed = new Set();
  const AUTO_EXPAND_SELECTORS = {
    workspaces: 'button[data-test="show-more-workspace"]',
    pages: 'button[data-test="show-more-page"]'
  };

  // Returns the list of selectors we should act on given the current scope.
  function getAutoExpandSelectors() {
    if (autoExpandScope === 'workspaces') return [AUTO_EXPAND_SELECTORS.workspaces];
    if (autoExpandScope === 'pages') return [AUTO_EXPAND_SELECTORS.pages];
    return [AUTO_EXPAND_SELECTORS.workspaces, AUTO_EXPAND_SELECTORS.pages];
  }

  // Normalize a stored scope value to one of the three valid strings.
  function normalizeAutoExpandScope(value) {
    return (value === 'workspaces' || value === 'pages') ? value : 'both';
  }

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
      debugLog('[Content] Removing body lock styles:', currentStyle);
      // Remove the inline style attributes that lock the body
      body.style.position = '';
      body.style.overflow = '';
      body.style.top = '';
      debugLog('[Content] Body lock removed');
    }
  }

  // Function to keep the messenger open: re-opens it when the page tries to close it
  // (e.g. via Angular's outside-click handler). It does NOT block any other clicks,
  // so page content and UI chrome (navbar, bell, etc.) remain interactive.
  function reopenMessengerIfClosed() {
    if (!keepMessengerExpandedActive) return;

    const sidebar = document.querySelector('coyo-messaging-sidebar, coyo-messaging-panel');
    if (!sidebar) return;

    const aside = sidebar.querySelector('aside.sidebar-container');
    if (!aside) return;

    const isCollapsed = aside.classList.contains('one-c');
    const isOpen =
      aside.classList.contains('two-c') ||
      aside.classList.contains('two-columns');

    if (isOpen) return;
    if (!isCollapsed) return;

    // Re-open by clicking the first channel-list-entry (the previous chat).
    // Falling back to the first entry keeps the chat stable for the user.
    const entry = sidebar.querySelector('coyo-messaging-channel-list-entry');
    if (entry) {
      debugLog('[Content] Messenger collapsed, re-opening via channel entry');
      entry.click();
    }
  }

  // Function to determine if a backdrop should be removed
  function isMessengerBackdrop(element) {
    // Only process if the feature is active
    if (!keepMessengerExpandedActive) return false;

    // Check if element has backdrop classes OR looks like an Angular backdrop
    const hasBackdropClass = element.classList && (
      element.classList.contains('cdk-overlay-backdrop') ||
      element.classList.contains('menu-overlay') ||
      element.classList.contains('cdk-overlay-dark-backdrop') ||
      element.classList.contains('cdk-overlay-transparent-backdrop')
    );

    // Also check for Angular-generated backdrop divs (position: fixed, background rgba, full screen)
    const style = element.getAttribute && element.getAttribute('style');
    const isAngularBackdrop = style &&
      style.includes('position: fixed') &&
      style.includes('background: rgba') &&
      style.includes('width: 100%') &&
      style.includes('height: 100%');

    if (!hasBackdropClass && !isAngularBackdrop) {
      return false;
    }

    // CRITICAL: Check if messenger panel actually exists
    // If no messenger panel, this backdrop belongs to a modal/search, not messenger
    const messengerPanel = document.querySelector('coyo-messaging-sidebar, coyo-messaging-panel');
    if (!messengerPanel) {
      debugLog('[Content] No messenger panel - NOT removing backdrop (belongs to modal/search)');
      return false;
    }

    // Count how many backdrops currently exist in the DOM
    const allBackdrops = document.querySelectorAll('.cdk-overlay-backdrop, .menu-overlay, div[style*="position: fixed"][style*="background: rgba"][style*="width: 100%"]');

    // If there are multiple backdrops, don't remove any of them
    // This means a modal is open on top of the messenger
    if (allBackdrops.length > 1) {
      debugLog('[Content] Multiple backdrops detected (' + allBackdrops.length + ') with messenger open, not removing any');
      return false;
    }

    // Messenger is open AND only one backdrop exists - it's the messenger backdrop, remove it
    debugLog('[Content] Single backdrop with messenger open - WILL REMOVE:', element.className || element.tagName);
    return true;
  }

  // Function to apply CSS for keeping messenger expanded
  function applyMessengerExpandedCSS(expanded, messengerPanelWidthPercent = MESSENGER_PANEL_WIDTH_DEFAULT_PERCENT) {
    const clampedWidthPercent = clampMessengerPanelWidthPercent(messengerPanelWidthPercent);
    debugLog('[Content] applyMessengerExpandedCSS called with expanded =', expanded, 'messengerPanelWidthPercent =', clampedWidthPercent);
    let styleElement = document.getElementById('haiilo-enhancer-messenger-style');

    keepMessengerExpandedActive = expanded;

    if (expanded) {
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'haiilo-enhancer-messenger-style';
        document.head.appendChild(styleElement);
        debugLog('[Content] Created new style element');
      }

      const messengerPanelWidthCSS = getMessengerPanelWidthCSS(clampedWidthPercent);

      // Add CSS to ensure page remains interactive
      // CRITICAL: Hide Angular backdrops via CSS (per CLAUDE.md lines 84-91)
      // This solves the race condition - CSS applies immediately, no need to wait for DOM
      // Modal backdrops are hidden by CSS but still clickable, so modals close normally
      const messengerCSS = `
        /* Hide Angular backdrop divs created for messenger */
        div[style*="position: fixed"][style*="background: rgba"][style*="width: 100%"] {
          display: none !important;
          pointer-events: none !important;
        }

        /* Ensure body and content remain interactive */
        body {
          pointer-events: auto !important;
        }

        /* Ensure main content stays interactive */
        .main-content,
        coyo-timeline,
        [class*="content"] {
          pointer-events: auto !important;
        }
      `;

      styleElement.textContent = messengerCSS + messengerPanelWidthCSS;
      debugLog('[Content] Applied messenger CSS with backdrop removal, width scaling, and interactivity fixes');

      // Remove any existing body lock styles
      removeBodyLockStyles();

      // Don't do initial backdrop removal here - let the MutationObserver
      // and periodic check handle it. This avoids timing issues with
      // messenger panel not being in DOM yet.

      // Watch for the messenger collapsing (e.g. after an outside click)
      // and re-open it. This keeps the messenger visible without blocking
      // any page-content clicks. We observe the messenger's sidebar host
      // for childList + the aside for class changes, then re-resolve the
      // aside on each fire. This is much cheaper than observing the
      // entire document for class changes.
      if (!messengerReopenObserver) {
        messengerReopenObserver = new MutationObserver(() => {
          if (!keepMessengerExpandedActive) return;
          reopenMessengerIfClosed();
        });

        // Observe broad enough to catch sidebar class flips and re-renders.
        // Using document.body avoids the single-target observer bug where
        // observe() was re-called on a different node and silently stopped
        // watching the sidebar host.
        messengerReopenObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class']
        });
        debugLog('[Content] Messenger re-open observer attached to document body');
      }

      // Set up MutationObserver to watch for body style changes
      if (!bodyStyleObserver) {
        bodyStyleObserver = new MutationObserver((mutations) => {
          if (!keepMessengerExpandedActive) return;

          for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
              const body = document.body;
              const currentStyle = body.getAttribute('style');

              // Check if body has locking styles
              if (currentStyle && (
                currentStyle.includes('position: fixed') ||
                currentStyle.includes('position:fixed') ||
                currentStyle.includes('overflow: hidden') ||
                currentStyle.includes('overflow:hidden')
              )) {
                debugLog('[Content] Body lock detected, removing immediately:', currentStyle);
                removeBodyLockStyles();
              }
            }
          }
        });

        bodyStyleObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ['style', 'class']
        });
        debugLog('[Content] Set up body style observer');
      }

      // Also watch for 'cdk-global-scrollblock' class being added
      if (!classObserver) {
        classObserver = new MutationObserver(() => {
          if (!keepMessengerExpandedActive) return;

          const html = document.documentElement;
          if (html.classList.contains('cdk-global-scrollblock')) {
            debugLog('[Content] Removing cdk-global-scrollblock from html');
            html.classList.remove('cdk-global-scrollblock');
          }
        });

        classObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class']
        });
        debugLog('[Content] Set up class observer');
      }

      // Set up MutationObserver to watch for backdrop elements being added
      setupBackdropObserver();

      debugLog('Applied CSS and body unlock for messenger expansion');
    } else {
      // Clean up when feature is disabled
      if (styleElement) {
        styleElement.remove();
        debugLog('[Content] Removed messenger expanded CSS');
      }

      // No click listeners to remove — the re-open observer handles everything.

      if (bodyStyleObserver) {
        bodyStyleObserver.disconnect();
        bodyStyleObserver = null;
        debugLog('[Content] Disconnected body style observer');
      }

      if (classObserver) {
        classObserver.disconnect();
        classObserver = null;
        debugLog('[Content] Disconnected class observer');
      }

      if (messengerOverlayObserver) {
        messengerOverlayObserver.disconnect();
        messengerOverlayObserver = null;
        debugLog('[Content] Disconnected messenger overlay observer');
      }

      if (messengerReopenObserver) {
        messengerReopenObserver.disconnect();
        messengerReopenObserver = null;
        debugLog('[Content] Disconnected messenger re-open observer');
      }

      debugLog('Removed messenger expanded CSS and observer');
    }
  }

  // Setup observer to detect and hide messenger backdrops as they're added.
  // Performance: the previous implementation also ran a 100ms setInterval
  // that re-scanned the entire DOM for backdrops while the messenger was
  // expanded. On a 5k-node page that's ~10 calls/sec × several full-tree
  // querySelectorAll()s = significant CPU. The CSS we inject already hides
  // messenger backdrops visually, so the MutationObserver alone is enough
  // to remove them from the DOM when they appear. We just need to debounce
  // the callback to avoid running on every mutation in a burst.
  function setupBackdropObserver() {
    if (messengerOverlayObserver) {
      messengerOverlayObserver.disconnect();
    }

    // Function to check and remove/hide backdrop
    const checkAndHideBackdrop = (element) => {
      // For Angular backdrops with inline styles, wait a bit for messenger panel to appear
      const style = element.getAttribute && element.getAttribute('style');
      const isAngularBackdrop = style &&
        style.includes('position: fixed') &&
        style.includes('background: rgba') &&
        style.includes('width: 100%') &&
        style.includes('height: 100%');

      if (isAngularBackdrop) {
        // Wait for messenger panel to appear before checking
        setTimeout(() => {
          if (isMessengerBackdrop(element)) {
            if (element.parentNode) {
              element.parentNode.removeChild(element);
              debugLog('[Content] Removed Angular messenger backdrop');
            }
          }
        }, 150);
      } else {
        // For standard CDK backdrops, check immediately
        if (isMessengerBackdrop(element)) {
          if (element.parentNode) {
            element.parentNode.removeChild(element);
            debugLog('[Content] Removed CDK messenger backdrop');
          }
        }
      }
    };

    // Debounced backdrop check. Haiilo triggers hundreds of mutations/sec
    // when the chat panel is active, and we don't need to react to each
    // one individually. Coalesce bursts into one pass.
    let pending = false;
    messengerOverlayObserver = new MutationObserver(() => {
      if (pending) return;
      if (!keepMessengerExpandedActive) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        if (!keepMessengerExpandedActive) return;

        // Only check the messenger panel subtree; the rest of the
        // page is irrelevant to backdrops.
        const panel = document.querySelector('coyo-messaging-sidebar, coyo-messaging-panel');
        if (!panel) return;

        // Quick scan of the panel subtree for known backdrop classes.
        const backdrops = panel.querySelectorAll(
          '.cdk-overlay-backdrop, .cdk-overlay-dark-backdrop, ' +
          '.cdk-overlay-transparent-backdrop, .menu-overlay'
        );
        backdrops.forEach(b => {
          if (isMessengerBackdrop(b) && b.parentNode) {
            b.parentNode.removeChild(b);
            debugLog('[Content] Removed messenger backdrop');
          }
        });

        // Angular-style inline-styled backdrops live at document level
        // (Haiilo's CDK overlay container is appended to body, not the
        // panel), so we also check there. Capped by selector specificity
        // so it stays fast.
        const angularBackdrops = document.querySelectorAll(
          'div[style*="position: fixed"][style*="background: rgba"][style*="width: 100%"]'
        );
        angularBackdrops.forEach(div => {
          if (isMessengerBackdrop(div) && div.parentNode) {
            div.parentNode.removeChild(div);
            debugLog('[Content] Removed Angular messenger backdrop');
          }
        });
      }, 100);
    });

    messengerOverlayObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    debugLog('[Content] Backdrop observer set up (debounced 100ms)');
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
        {
          const svgNS = 'http://www.w3.org/2000/svg';
          const svg = document.createElementNS(svgNS, 'svg');
          svg.setAttribute('width', svgSize);
          svg.setAttribute('height', svgSize);
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.setAttribute('fill', 'white');
          svg.style.display = 'block';

          const c1 = document.createElementNS(svgNS, 'circle');
          c1.setAttribute('cx', '8');
          c1.setAttribute('cy', '8');
          c1.setAttribute('r', '4');

          const c2 = document.createElementNS(svgNS, 'circle');
          c2.setAttribute('cx', '16');
          c2.setAttribute('cy', '8');
          c2.setAttribute('r', '4');

          const p = document.createElementNS(svgNS, 'path');
          p.setAttribute('d', 'M12 14c-3 0-5 1.5-5 3v1h10v-1c0-1.5-2-3-5-3z');

          svg.appendChild(c1);
          svg.appendChild(c2);
          svg.appendChild(p);
          badge.appendChild(svg);
        }
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

  // Recursively find all elements matching a selector, piercing open
  // shadow roots. document.querySelector / querySelectorAll only search
  // the light DOM of the document and the connected composed trees
  // of standard elements; they do NOT descend into open shadow roots.
  // Haiilo's show-more buttons are inside shadow roots (e.g. coyo-*
  // Stencil components), so plain document.querySelector returns null.
  //
  // Performance: this walk costs ~3-5ms per call on a Haiilo page with
  // 3-5k DOM nodes. The auto-expand mount observer and click loop both
  // call this many times per second, so we cache results within a
  // single animation frame to avoid repeated walks when the runner
  // queries the same selector back-to-back.
  const _findInShadowsCache = new Map();
  // Cache key includes a per-root identity so that two different
  // host elements with the same tag name don't share a cache entry.
  // For the document root, we use a constant key.
  function _findInShadowsKey(selector, root) {
    return root === document ? selector : selector + '|' + (root.host ? _hostId(root.host) : '?');
  }
  // Stable per-host key: index assigned in insertion order. Survives
  // re-renders of unrelated hosts, invalidates when the same host slot
  // gets a new element (we map host -> id on first sight).
  const _hostIdMap = new WeakMap();
  let _nextHostId = 1;
  function _hostId(host) {
    if (_hostIdMap.has(host)) return _hostIdMap.get(host);
    const id = _nextHostId++;
    _hostIdMap.set(host, id);
    return id;
  }
  function findInShadows(selector, root = document) {
    const cacheKey = _findInShadowsKey(selector, root);
    if (_findInShadowsCache.has(cacheKey)) {
      return _findInShadowsCache.get(cacheKey);
    }
    const out = [];
    try {
      out.push(...root.querySelectorAll(selector));
    } catch (e) {
      // Some selector roots (e.g. a ShadowRoot) accept querySelectorAll;
      // others may not. Either way, fall through to the recursion below.
    }
    const all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const el of all) {
      if (el.shadowRoot) {
        out.push(...findInShadows(selector, el.shadowRoot));
      }
    }
    _findInShadowsCache.set(cacheKey, out);
    return out;
  }
  function clearFindInShadowsCache() {
    _findInShadowsCache.clear();
    // _hostIdMap is a WeakMap and is self-cleaning.
  }

  function runWhenIdle(callback, timeout = 1000) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(callback, { timeout });
      return;
    }

    setTimeout(callback, 0);
  }

  // Find the list container that a given show-more button belongs to.
  // We walk up via parentNode (which crosses shadow boundaries via
  // .host) looking for an ancestor that has more than one child,
  // so we can detect "did anything get added?" between clicks.
  function findOwningList(button) {
    let current = button.parentNode;
    let depth = 0;
    const maxDepth = 12;

    while (current && depth < maxDepth) {
      // If we hit a shadow root, jump up to its host element.
      if (current.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) {
        current = current.host;
        continue;
      }
      // Containers typically have multiple direct children (>1)
      // and are not the document body / a button itself.
      if (current.children && current.children.length > 1 &&
          current !== document.body && current !== document.documentElement) {
        return current;
      }
      current = current.parentNode;
      depth++;
    }
    return null;
  }

  // Wait until the list grows (more children than before) or timeout.
  // Returns the new child count, or the old count if we timed out.
  function waitForListGrowth(list, previousCount, timeoutMs) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        if (!list || !document.contains(list)) {
          resolve(previousCount);
          return;
        }
        const currentCount = list.children.length;
        if (currentCount > previousCount) {
          resolve(currentCount);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(currentCount);
          return;
        }
        setTimeout(check, 50);
      };
      check();
    });
  }

  // Dispatch a full click sequence (pointer + mouse + click) on a button.
  // Haiilo's show-more button is a Stencil `cat-button` web component; it
  // listens to pointerdown/pointerup/click. Calling HTMLElement.click()
  // only fires a generic click event and Stencil's pointer handlers
  // never run, so the list never expands. We synthesize all of them
  // as non-bubbling + bubbling variants to maximize compatibility.
  function dispatchFullClick(target) {
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const baseInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: x,
      clientY: y
    };
    const types = [
      ['pointerdown', { pointerType: 'mouse', isPrimary: true, pointerId: 1 }],
      ['mousedown',   {}],
      ['pointerup',   { pointerType: 'mouse', isPrimary: true, pointerId: 1 }],
      ['mouseup',     {}],
      ['click',       {}]
    ];
    for (const [type, extra] of types) {
      let ev;
      try {
        if (type === 'pointerdown' || type === 'pointerup') {
          ev = new PointerEvent(type, { ...baseInit, ...extra });
        } else {
          ev = new MouseEvent(type, { ...baseInit, ...extra });
        }
      } catch (e) {
        // Older browsers: fall back to a generic Event for pointer events.
        ev = new Event(type, { bubbles: true, cancelable: true });
      }
      target.dispatchEvent(ev);
    }
  }

  // Click a single show-more button up to maxClicks times, stopping early
  // if the button disappears or no new items are added.
  async function clickShowMoreButton(button, maxClicks) {
    if (maxClicks <= 0) return;

    // Mark the button as already processed in this session so the
    // MutationObserver doesn't try to click it again.
    button.dataset.haiiloEnhancerClicked = '1';

    const list = findOwningList(button);
    const testAttr = button.getAttribute('data-test');
    debugLog('[AutoExpand] Starting for', testAttr, 'maxClicks=', maxClicks, 'list=', list ? list.tagName.toLowerCase() : 'null');

    let noGrowthStreak = 0;
    let clicksDone = 0;

    for (let i = 0; i < maxClicks; i++) {
      // Re-query every iteration: the button may be replaced by a new
      // DOM element after each click (Haiilo re-renders the list).
      // We MUST search through shadow roots - the buttons are inside them.
      // Clear the findInShadows cache first so we see the new DOM, not
      // the snapshot from before the click.
      clearFindInShadowsCache();
      const candidates = findInShadows(`button[data-test="${testAttr}"]`);
      // If we already processed this exact button on a previous iteration,
      // skip to the next unprocessed one.
      const current = candidates.find(b => b.dataset.haiiloEnhancerClicked !== '1') || candidates[0];
      if (!current) {
        debugLog('[AutoExpand]', testAttr, 'button no longer in DOM after', clicksDone, 'clicks - list fully expanded');
        return;
      }
      if (current.disabled || current.getAttribute('aria-disabled') === 'true') {
        debugLog('[AutoExpand]', testAttr, 'button is disabled, stopping');
        return;
      }

      const beforeCount = list && document.contains(list) ? list.children.length : -1;

      // Tag and click.
      current.dataset.haiiloEnhancerClicked = '1';
      try {
        dispatchFullClick(current);
        // Also fire the native click() as a last-resort fallback for any
        // listener that only watches the standard click event.
        current.click();
        clicksDone++;
      } catch (e) {
        debugLog('[AutoExpand] Click failed on', testAttr, e.message);
        return;
      }

      // Wait for new items to appear, up to 2x the configured delay.
      const waitMs = Math.max(200, autoExpandDelayMs * 2);
      const afterCount = list && document.contains(list)
        ? await waitForListGrowth(list, beforeCount, waitMs)
        : -1;

      if (afterCount === beforeCount || afterCount < 0) {
        noGrowthStreak++;
        debugLog('[AutoExpand]', testAttr, 'no new items after click', clicksDone, '(streak', noGrowthStreak + ')');
        // Be patient: Haiilo's XHR can be slow on first click. Only stop
        // after 3 consecutive no-growth clicks to avoid bailing out
        // before the first request finishes.
        if (noGrowthStreak >= 3) {
          debugLog('[AutoExpand]', testAttr, 'stopping - no growth for', noGrowthStreak, 'consecutive clicks');
          return;
        }
      } else {
        noGrowthStreak = 0;
      }

      // Brief pause before next click to avoid hammering the server.
      await new Promise(r => setTimeout(r, autoExpandDelayMs));
    }

    debugLog('[AutoExpand] Finished', testAttr, 'after', clicksDone, 'clicks');
  }

  // Find all show-more buttons and start a click loop on each one that
  // hasn't been processed yet. Each button is independent: if only the
  // workspace button is in the DOM when this runs, only that one is
  // started. When the pages button later appears (Haiilo re-renders
  // the sidebar), the mount observer will call this again and pick
  // up the pages button then.
  function autoExpandShowMoreLists() {
    if (!autoExpandEnabled) {
      debugLog('[AutoExpand] Disabled, skipping');
      return;
    }
    if (autoExpandClicksPerList <= 0) {
      debugLog('[AutoExpand] Clicks per list set to 0, skipping');
      return;
    }

    const selectors = getAutoExpandSelectors();
    const scopeHasUnprocessed = selectors.some(sel => {
      // fast-path: if we've already processed the data-test key for
      // this selector, no need to walk the DOM.
      return !autoExpandProcessed.has(getDataTestForSelector(sel));
    });
    if (!scopeHasUnprocessed) {
      return;
    }

    const newlyFound = [];
    selectors.forEach(sel => {
      findInShadows(sel).forEach(btn => {
        const key = btn.getAttribute('data-test');
        if (!autoExpandProcessed.has(key)) {
          newlyFound.push(btn);
        }
      });
    });

    if (newlyFound.length === 0) {
      return;
    }

    // Mark each button as processed BEFORE starting its loop so the
    // mount observer doesn't queue a duplicate run for the same button.
    newlyFound.forEach(btn => autoExpandProcessed.add(btn.getAttribute('data-test')));

    debugLog('[AutoExpand] Starting click loop for', newlyFound.length, 'new button(s) (scope=' + autoExpandScope + ', clicksPerList=' + autoExpandClicksPerList + ')');

    // Run each list expansion in parallel; they target different buttons.
    newlyFound.forEach(btn => {
      clickShowMoreButton(btn, autoExpandClicksPerList).catch(err => {
        debugLog('[AutoExpand] Error expanding list:', err && err.message);
      });
    });

    // If every button in scope is now processed, the observer has no
    // further work and we can stop it. (Haiilo can still re-render the
    // sidebar; if it does, a freshly-mounted button is a new DOM node
    // and may be re-found. We re-install the observer on the next
    // mutation if that happens.)
    maybeStopAutoExpandObserver();
  }

  // Returns the data-test attribute value for one of the configured
  // show-more selectors (e.g. 'button[data-test="show-more-page"]' ->
  // 'show-more-page'). Used as the per-button key in autoExpandProcessed.
  function getDataTestForSelector(selector) {
    const m = selector.match(/data-test="([^"]+)"/);
    return m ? m[1] : selector;
  }

  // If the runner has processed every button in scope, stop the
  // observer to save CPU. Re-install from inside clickShowMoreButton
  // if a click triggers a re-render that re-mounts a button (not
  // expected today, but cheap insurance).
  function maybeStopAutoExpandObserver() {
    if (!autoExpandMountObserver) return;
    const allProcessed = getAutoExpandSelectors().every(sel =>
      autoExpandProcessed.has(getDataTestForSelector(sel))
    );
    if (allProcessed) {
      autoExpandMountObserver.disconnect();
      autoExpandMountObserver = null;
      debugLog('[AutoExpand] All buttons processed, mount observer stopped');
    }
  }

  // Observe the document so we run auto-expand once the sidebar list
  // is actually rendered. Haiilo's sidebar mounts after initial paint,
  // and the workspaces and pages lists may appear at different times
  // (the sidebar re-renders when messenger state or other UI state
  // changes). Per-button state (autoExpandProcessed) ensures each
  // list is processed exactly once per page load.
  //
  // Performance: Haiilo triggers hundreds of DOM mutations per second
  // even when idle (chat updates, online-status pings, etc.). Without
  // throttling, our observer would call findInShadows (a full-tree walk)
  // hundreds of times per second. We debounce to 200ms, then schedule the
  // full shadow-DOM scan for idle time so the timer callback itself stays
  // cheap and avoids Chrome long-task warnings.
  function setupAutoExpandMountObserver() {
    if (autoExpandMountObserver) return;
    let pending = false;
    autoExpandMountObserver = new MutationObserver(() => {
      if (pending) return;
      if (!autoExpandEnabled) return;
      pending = true;
      setTimeout(() => {
        runWhenIdle(() => {
          pending = false;
          if (!autoExpandEnabled) return;
          // The DOM has likely changed since the last walk; clear the
          // findInShadows cache so the runner sees fresh results.
          clearFindInShadowsCache();
          autoExpandShowMoreLists();
          maybeStopAutoExpandObserver();
        });
      }, 200);
    });
    autoExpandMountObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    debugLog('[AutoExpand] Mount observer installed (debounced 200ms)');
  }

  // ── Reaction enhancements ──────────────────────────────────────────────────

  // Fetch and cache the current user's sender ID (required by the summary API).
  async function getSenderId() {
    if (reactionSenderIdCache) return reactionSenderIdCache;
    // 1. Try performance entries — already loaded on the page
    try {
      const entries = performance.getEntriesByType('resource');
      for (const e of entries) {
        if (e.name.includes('senderId=')) {
          const id = new URL(e.name).searchParams.get('senderId');
          if (id) { reactionSenderIdCache = id; return id; }
        }
      }
    } catch (e) { /* ignore */ }
    // 2. Fetch from /web/users/me
    try {
      const res = await fetch('/web/users/me');
      if (res.ok) {
        const data = await res.json();
        if (data?.id) { reactionSenderIdCache = data.id; return data.id; }
      }
    } catch (e) {
      debugLog('[Reactions] Failed to fetch senderId:', e);
    }
    return null;
  }

  // Fetch and cache the reaction type metadata (unicode emoji per type).
  async function getReactionTypes() {
    if (reactionTypesCache) return reactionTypesCache;
    try {
      const res = await fetch('/web/reaction-targets/types');
      if (!res.ok) return null;
      const types = await res.json();
      reactionTypesCache = {};
      for (const t of types) {
        reactionTypesCache[t.reactionType] = { unicode: t.fallbackUnicode };
      }
      return reactionTypesCache;
    } catch (e) {
      debugLog('[Reactions] Failed to fetch reaction types:', e);
      return null;
    }
  }

  // Reorder cat-icon elements to match sortedTypes order.
  // Icons are positionally mapped to allReactionsByCount (same order as the API response).
  function reorderReactionIcons(icons, currentApiOrder, sortedTypes) {
    if (icons.length < 2) return;
    // Map each icon to its type by position (API order == DOM order)
    const iconsByType = {};
    currentApiOrder.forEach((type, i) => {
      if (icons[i]) iconsByType[type] = icons[i];
    });
    // Build target order following sortedTypes
    const targetIcons = sortedTypes.map(t => iconsByType[t]).filter(Boolean);
    // Append any icons not in sortedTypes (shouldn't happen but be safe)
    for (const icon of icons) {
      if (!targetIcons.includes(icon)) targetIcons.push(icon);
    }
    // Check if already correct
    const alreadyCorrect = targetIcons.every((icon, i) => icon === icons[i]);
    if (alreadyCorrect) return;
    // Re-insert before the first icon's position
    const parent = icons[0].parentNode;
    const anchor = icons[0];
    for (const icon of targetIcons) {
      parent.insertBefore(icon, anchor);
    }
    debugLog('[Reactions] Reordered icons to:', sortedTypes.join(', '));
  }

  // Inject (or update) a count tooltip into the cat-tooltip of a coyo-reactions-info.
  function injectReactionTooltip(reactionsInfo, sortedData, typeMap) {
    const text = sortedData
      .map(({ reactionType, count }) => {
        const unicode = typeMap?.[reactionType]?.unicode || reactionType;
        return `${unicode}${count}`;
      })
      .join(' ');

    // Set a native tooltip as a reliable fallback. Haiilo's custom tooltip
    // component may not refresh its named slot after Angular hydration.
    reactionsInfo.setAttribute('title', text);
    reactionsInfo.setAttribute('aria-label', `Reactions: ${text}`);
    const trigger = reactionsInfo.querySelector('cat-tooltip > cat-button');
    if (trigger) {
      trigger.setAttribute('title', text);
      trigger.setAttribute('aria-label', `Reactions: ${text}`);
    }

    const tooltip = reactionsInfo.querySelector('cat-tooltip');
    if (tooltip) {
      // Remove any previously injected tooltip content
      const existing = tooltip.querySelector('.haiilo-enhancer-reaction-tooltip');
      if (existing) existing.remove();
      const p = document.createElement('p');
      p.slot = 'content';
      p.className = 'haiilo-enhancer-reaction-tooltip';
      p.textContent = text;
      tooltip.appendChild(p);
    }
    debugLog('[Reactions] Injected tooltip:', text);
  }

  function injectInlineReactionCounts(reactionsInfo, displayedData) {
    reactionsInfo.querySelectorAll('.haiilo-enhancer-reaction-count').forEach(el => el.remove());
    const icons = [...reactionsInfo.querySelectorAll('cat-icon[data-test="reactions-info-icon"]')];
    icons.forEach((icon, index) => {
      const reaction = displayedData[index];
      if (!reaction) return;
      const count = document.createElement('span');
      count.className = 'haiilo-enhancer-reaction-count';
      count.textContent = String(reaction.count);
      count.setAttribute('aria-label', `${reaction.count} reactions`);
      icon.after(count);
    });
  }

  // Process a single [data-reaction-target-id] anchor element.
  async function processReactionTarget(dataEl) {
    if (dataEl.dataset.haiiloEnhancerReactionsDone) return;
    dataEl.dataset.haiiloEnhancerReactionsDone = '1';

    const targetId = dataEl.dataset.reactionTargetId;
    const targetType = dataEl.dataset.reactionTargetType;
    const count = parseInt(dataEl.dataset.reactionCount, 10);
    if (!targetId || !targetType || !Number.isFinite(count) || count < 1) return;

    const typeMap = await getReactionTypes();

    const senderId = await getSenderId();

    // Fetch the summary for this target
    let apiData, sortedData;
    try {
      const url = senderId
        ? `/web/reaction-targets/${targetType}?senderId=${senderId}&ids=${targetId}`
        : `/web/reaction-targets/${targetType}?ids=${targetId}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const entry = json[targetId];
      if (!entry || !Array.isArray(entry.allReactionsByCount)) return;
      // apiData preserves the API's original order (matches DOM icon order)
      apiData = entry.allReactionsByCount;
      // sortedData is sorted descending by count
      sortedData = [...apiData].sort((a, b) => b.count - a.count);
    } catch (e) {
      debugLog('[Reactions] Failed to fetch summary for', targetId, e);
      return;
    }

    // Find the enclosing coyo-reactions-info
    const reactionsInfo = dataEl.closest('coyo-reactions-info') ||
      dataEl.parentElement?.querySelector('coyo-reactions-info') ||
      dataEl.closest('[data-test="info-container"]')?.querySelector('coyo-reactions-info');
    if (!reactionsInfo) return;

    // Wait briefly for icons to render if they haven't yet
    let icons = [...reactionsInfo.querySelectorAll('cat-icon[data-test="reactions-info-icon"]')];
    if (icons.length === 0) {
      await new Promise(r => setTimeout(r, 150));
      icons = [...reactionsInfo.querySelectorAll('cat-icon[data-test="reactions-info-icon"]')];
    }

    // currentApiOrder: the types in DOM order (API order == icon DOM order)
    const currentApiOrder = apiData.map(d => d.reactionType);
    const sortedTypes = sortedData.map(d => d.reactionType);

    if (sortReactionsByCount && icons.length >= 2) {
      reorderReactionIcons(icons, currentApiOrder, sortedTypes);
    }

    if (showReactionCountTooltip) {
      injectReactionTooltip(reactionsInfo, sortedData, typeMap);
    }
    if (showReactionCountInline) {
      injectInlineReactionCounts(reactionsInfo, sortReactionsByCount ? sortedData : apiData);
    }
  }

  function setupReactionEnhancerObserver() {
    if (reactionEnhancerObserver) reactionEnhancerObserver.disconnect();

    // Process any already-present targets on the page
    document.querySelectorAll('[data-reaction-target-id]').forEach(el => {
      processReactionTarget(el).catch(() => {});
    });

    reactionEnhancerObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          // Direct match
          if (node.hasAttribute && node.hasAttribute('data-reaction-target-id')) {
            processReactionTarget(node).catch(() => {});
          }
          // Descendants
          if (node.querySelectorAll) {
            node.querySelectorAll('[data-reaction-target-id]').forEach(el => {
              processReactionTarget(el).catch(() => {});
            });
          }
        }
      }
    });

    reactionEnhancerObserver.observe(document.body, { childList: true, subtree: true });
    debugLog('[Reactions] Observer installed');
  }

  // Re-run reaction enhancements after settings change (clear processed flags first).
  function reapplyReactionEnhancements() {
    // Clear done flags so existing elements are reprocessed
    document.querySelectorAll('[data-reaction-target-id][data-haiilo-enhancer-reactions-done]')
      .forEach(el => {
        delete el.dataset.haiiloEnhancerReactionsDone;
        // Also clear injected tooltips if feature disabled
        if (!showReactionCountTooltip) {
          const ri = el.closest('coyo-reactions-info') ||
            el.closest('[data-test="info-container"]')?.querySelector('coyo-reactions-info');
          if (ri) ri.querySelector('.haiilo-enhancer-reaction-tooltip')?.remove();
        }
        if (!showReactionCountInline) {
          const ri = el.closest('coyo-reactions-info') ||
            el.closest('[data-test="info-container"]')?.querySelector('coyo-reactions-info');
          if (ri) ri.querySelectorAll('.haiilo-enhancer-reaction-count').forEach(node => node.remove());
        }
      });
    if (sortReactionsByCount || showReactionCountTooltip || showReactionCountInline) {
      setupReactionEnhancerObserver();
    }
  }

  // ── End Reaction enhancements ──────────────────────────────────────────────

  // Initialize
  init();

  let messageListenerRegistered = false;

  async function init() {
    try {
      debugLog('Content script initialized');
      // Reset the processed flag on each initialization
      channelAvatarsProcessed = false;
      await loadSettings();

      // Register message listener once so we can receive notifications to re-enable
      if (!messageListenerRegistered && isExtensionContextValid() && browserAPI.runtime.onMessage) {
        browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
          try {
            debugLog('Content script received message:', message.action);
          
            if (message.action === 'refreshFilter') {
              if (!extensionEnabled) {
                sendResponse({ success: true });
                return;
              }
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

                    if (message.action === 'getHiddenDetails') {
                      sendResponse({ count: hiddenCount, items: hiddenItems });
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
              const activeElement = document.activeElement;
              const userName = findUserNameFromElement(activeElement) || lastRightClickedUser;
              sendResponse({ userName: userName });
            }

            if (message.action === 'getHomepageUrl') {
              const homepageInfo = getHomepageFromElement(lastRightClickedElement);
              sendResponse(homepageInfo);
            }

            if (message.action === 'updateHomepageRedirect') {
              if (!extensionEnabled) {
                sendResponse({ success: true });
                return;
              }
              loadCustomHomepage();
              sendResponse({ success: true });
            }

            if (message.action === 'toggleMessengerExpanded') {
              if (!extensionEnabled) {
                sendResponse({ success: true });
                return;
              }
              const widthPercent = clampMessengerPanelWidthPercent(message.messengerPanelWidthPercent);
              debugLog('Content script received toggleMessengerExpanded:', message.expanded, 'messengerPanelWidthPercent:', widthPercent);
              applyMessengerExpandedCSS(message.expanded, widthPercent);
              debugLog('Applied messenger expanded CSS for:', message.expanded, 'with width percent:', widthPercent);
              sendResponse({ success: true });
            }

            if (message.action === 'settingsUpdated') {
              const wasEnabled = extensionEnabled;
              loadSettings().then(() => {
                if (wasEnabled !== extensionEnabled) {
                  debugLog('Extension enabled state changed from', wasEnabled, 'to', extensionEnabled, '- reloading page');
                  window.location.reload();
                  sendResponse({ success: true });
                  return;
                }

                if (!extensionEnabled) {
                  sendResponse({ success: true });
                  return;
                }

                autoExpandProcessed.clear();
                autoExpandShowMoreLists();
                if (!autoExpandMountObserver) {
                  setupAutoExpandMountObserver();
                }
                reapplyReactionEnhancements();
                sendResponse({ success: true });
              });
              return true;
            }
          } catch (e) {
            console.error('Error in message handler:', e);
            sendResponse({ success: false, error: e.message });
          }
        });
        messageListenerRegistered = true;
      }

      if (!extensionEnabled) {
        debugLog('Extension is disabled via kill-switch. Skipping initialization.');
        hiddenCount = 0;
        updateBadge();
        return;
      }

      await loadMutedUsers();
      await loadCustomHomepage();
      setupMutationObserver();
      setupTypingPauseListener();
      setupRightClickListener();
      setupLogoClickInterceptor();
      hideContent();

      // Auto-expand sidebar lists (Workspaces / Pages) if enabled.
      // Try once now; if the sidebar isn't mounted yet, the observer
      // below will catch it when it appears.
      debugLog('[AutoExpand] init - enabled=', autoExpandEnabled,
               'scope=', autoExpandScope,
               'clicksPerList=', autoExpandClicksPerList,
               'delayMs=', autoExpandDelayMs);
      autoExpandShowMoreLists();
      setupAutoExpandMountObserver();

      // Reaction enhancements (sort by count, hover tooltip)
      if (sortReactionsByCount || showReactionCountTooltip || showReactionCountInline) {
        setupReactionEnhancerObserver();
      }

      // Replace generic channel avatars and process date/times
      setTimeout(() => {
        if (isExtensionContextValid()) {
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
  }

  async function loadSettings() {
    try {
      if (isExtensionContextValid()) {
        try {
          const settings = await safeSendMessage({ action: 'getSettings' });
          extensionEnabled = settings.extensionEnabled !== false; // Default to true
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
          dateFormat = normalizeDateFormatValue(settings.dateFormat || 'northAmerican12h');
          timeFormat = settings.timeFormat || '12h';
          autoExpandEnabled = settings.autoExpandEnabled === true;
          const rawClicks = parseInt(settings.autoExpandClicksPerList, 10);
          autoExpandClicksPerList = isNaN(rawClicks) ? 3 : Math.max(0, Math.min(10, rawClicks));
          const rawDelay = parseInt(settings.autoExpandDelayMs, 10);
          autoExpandDelayMs = isNaN(rawDelay) ? 300 : Math.max(100, Math.min(1000, rawDelay));
          autoExpandScope = normalizeAutoExpandScope(settings.autoExpandScope);
          sortReactionsByCount = settings.sortReactionsByCount !== false;
          showReactionCountTooltip = settings.showReactionCountTooltip === true;
          showReactionCountInline = settings.showReactionCountInline === true;
          const messengerPanelWidthPercent = clampMessengerPanelWidthPercent(settings.messengerPanelWidthPercent);
          debugLog('[Content] keepMessengerExpanded setting:', settings.keepMessengerExpanded);
          debugLog('[Content] messengerPanelWidthPercent setting:', messengerPanelWidthPercent);
          if (extensionEnabled && settings.keepMessengerExpanded) {
            debugLog('[Content] Applying messenger expanded CSS on page load');
            applyMessengerExpandedCSS(true, messengerPanelWidthPercent);
          }
          debugLog('Debug mode:', debugMode);
          debugLog('Enhance channel avatars:', enhanceChannelAvatars);
          debugLog('Avatar style:', avatarStyle, 'Ring:', ringColor, ringWidth, 'Square:', squareColor, squareWidth, 'Badge:', badgeSize, badgePosition);
          debugLog('Color mode:', colorMode, 'Fixed color:', fixedColor);
          debugLog('Date format:', dateFormat, 'Time format:', timeFormat);
        } catch (error) {
          // safeSendMessage already handles context errors
          console.error('Failed to load settings:', error);
          extensionEnabled = true;
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
          autoExpandEnabled = false;
          autoExpandClicksPerList = 3;
          autoExpandDelayMs = 300;
          autoExpandScope = 'both';
          sortReactionsByCount = true;
          showReactionCountTooltip = true;
          showReactionCountInline = false;
        }
      } else {
        debugLog('Cannot load settings: extension context invalid');
        extensionEnabled = true;
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
        autoExpandEnabled = false;
        autoExpandClicksPerList = 3;
        autoExpandDelayMs = 300;
        autoExpandScope = 'both';
        sortReactionsByCount = true;
        showReactionCountTooltip = true;
        showReactionCountInline = false;
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
      autoExpandEnabled = false;
      autoExpandClicksPerList = 3;
      autoExpandDelayMs = 300;
      autoExpandScope = 'both';
      sortReactionsByCount = true;
      showReactionCountTooltip = true;
      showReactionCountInline = false;
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
      if (isTyping) return;

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
          if (isExtensionContextValid()) {
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

  function setupTypingPauseListener() {
    const isTextInput = (el) => {
      if (!el) return false;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName === 'INPUT') {
        const type = (el.type || 'text').toLowerCase();
        return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(type);
      }
      if (el.isContentEditable) return true;
      return false;
    };

    document.addEventListener('focusin', (e) => {
      if (isTextInput(e.target)) {
        isTyping = true;
        debugLog('[Content] Typing started, pausing date processing');
      }
    });

    document.addEventListener('focusout', (e) => {
      if (!isTextInput(e.target)) return;
      setTimeout(() => {
        if (isTextInput(document.activeElement)) return;
        isTyping = false;
        debugLog('[Content] Typing ended, resuming date processing');
        if (isExtensionContextValid()) {
          processAllDateTimes();
        }
      }, 0);
    });

    document.addEventListener('compositionstart', () => {
      isTyping = true;
    });
  }

  function setupRightClickListener() {
    document.addEventListener('contextmenu', (e) => {
      lastRightClickedUser = null;
      lastRightClickedElement = e.target;

      // Try to find username from the clicked element or its ancestors
      const userName = findUserNameFromElement(e.target);
      if (userName) {
        lastRightClickedUser = userName;
        debugLog('Right-click detected on user:', userName);
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

  function normalizeWhitespace(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function collectMatchedTexts(root, selectors) {
    if (!root || !selectors || selectors.length === 0) return [];

    const out = [];
    const seen = new Set();

    const searchRoot = (currentRoot) => {
      for (const selector of selectors) {
        let matches = [];
        try {
          matches = currentRoot.querySelectorAll(selector);
        } catch (e) {
          continue;
        }

        for (const match of matches) {
          const text = normalizeWhitespace(match && match.textContent);
          if (text && !seen.has(text)) {
            seen.add(text);
            out.push(text);
          }
        }
      }

      const descendants = currentRoot.querySelectorAll ? currentRoot.querySelectorAll('*') : [];
      for (const descendant of descendants) {
        if (descendant.shadowRoot && searchRoot(descendant.shadowRoot)) {
          return true;
        }
      }

      return false;
    };

    searchRoot(root);
    return out;
  }

  function itemHasMutedAuthor(item, userName, selectors) {
    if (!item || !userName || !selectors || selectors.length === 0) return false;

    const normalizedName = userName.trim();
    return collectMatchedTexts(item, selectors).some(text => text === normalizedName);
  }

  function buildHiddenItemDetails(item, userName, kind, selectors, matchedSelector) {
    const matchedAuthors = collectMatchedTexts(item, selectors);
    const text = normalizeWhitespace(item && item.innerText ? item.innerText : item && item.textContent);
    const excerpt = text.length > 220 ? `${text.slice(0, 217)}...` : text;

    return {
      kind,
      mutedUser: userName,
      matchedAuthors,
      matchedSelector,
      excerpt
    };
  }

  function hideMatchedElement(element, details) {
    if (!element) return false;
    element.style.display = 'none';
    hiddenCount++;
    if (details) hiddenItems.push(details);
    return true;
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
    hiddenItems = [];
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
    hiddenItems = [];
    debugLog('Starting content filtering...');
    const hiddenElements = new WeakSet();

    // Simple approach like the original working script
    mutedUsers.forEach(user => {
      const userName = user.name.trim();
      const timelineAuthorSelectors = [
        'cat-sender-link',
        '[data-test="comment-author"]',
        'sectionheader cat-sender-link',
        'sectionheader [data-test="comment-author"]',
        'sectionheader button',
        'sectionheader a',
        '[role="sectionheader"] cat-sender-link',
        '[role="sectionheader"] [data-test="comment-author"]',
        '[role="sectionheader"] button',
        '[role="sectionheader"] a'
      ];

      // Hide posts by the user (simple selector like original)
      document.querySelectorAll('coyo-timeline-item').forEach(item => {
        if (!hiddenElements.has(item) && itemHasMutedAuthor(item, userName, timelineAuthorSelectors)) {
          hiddenElements.add(item);
          hideMatchedElement(item, buildHiddenItemDetails(item, userName, 'timeline item', timelineAuthorSelectors, 'timeline-header'));
          debugLog('Hidden timeline post by:', userName);
        }
      });

      // Hide comments by the user (simple selector like original)
      document.querySelectorAll('coyo-comment').forEach(comment => {
        if (!hiddenElements.has(comment) && itemHasMutedAuthor(comment, userName, ['[data-test="comment-author"]'])) {
          hiddenElements.add(comment);
          hideMatchedElement(comment, buildHiddenItemDetails(comment, userName, 'comment', ['[data-test="comment-author"]'], 'comment-author'));
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
          if (hiddenElements.has(item)) return;
          // Try multiple author selectors
          const authorSelectors = [
            'cat-sender-link',
            '[data-test="comment-author"]',
            'sectionheader cat-sender-link',
            'sectionheader [data-test="comment-author"]',
            'sectionheader button',
            'sectionheader a',
            '[role="sectionheader"] cat-sender-link',
            '[role="sectionheader"] [data-test="comment-author"]',
            '[role="sectionheader"] button',
            '[role="sectionheader"] a',
            '[class*="author"]',
            '[class*="user-name"]',
            'a[href*="/user/"]',
            'a[href*="/profile/"]'
          ];

          for (const authorSelector of authorSelectors) {
            const authorElement = item.querySelector(authorSelector);
            if (authorElement && authorElement.textContent.trim() === userName) {
              hiddenElements.add(item);
              hideMatchedElement(item, buildHiddenItemDetails(item, userName, 'content item', authorSelectors, authorSelector));
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
        try {
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
        } catch (e) {
          debugLog('Error parsing URL in getHomepageFromElement:', current.href, e);
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

  const DATE_TIME_PRESETS = {
    northAmerican12h: { dateFormat: 'MM/DD/YYYY', timeFormat: '12h' },
    westernEuropean12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h' },
    westernEuropean24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h' },
    centralEuropean24h: { dateFormat: 'DD.MM.YYYY', timeFormat: '24h' },
    dutch24h: { dateFormat: 'DD-MM-YYYY', timeFormat: '24h' },
    iso860124h: { dateFormat: 'YYYY-MM-DD', timeFormat: '24h' },
    eastAsian12h: { dateFormat: 'YYYY/MM/DD', timeFormat: '12h' },
    eastAsian24h: { dateFormat: 'YYYY/MM/DD', timeFormat: '24h' },
    hungarian24h: { dateFormat: 'YYYY. MM. DD.', timeFormat: '24h' },
    finnish24h: { dateFormat: 'D.M.YYYY', timeFormat: '24h' },
    spacedCentral24h: { dateFormat: 'D. M. YYYY', timeFormat: '24h' },
    dottedSlavic24h: { dateFormat: 'D.M.YYYY.', timeFormat: '24h' },
    spacedSlavic24h: { dateFormat: 'D. M. YYYY.', timeFormat: '24h' },
    korean24h: { dateFormat: 'YYYY. M. D.', timeFormat: '24h' },
    southAsian12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h' },
    southAsian24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h' },
    latinAmerican12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h' },
    latinAmerican24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h' },
    middleEastern24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h' },
    southeastAsian12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h' },
    southeastAsian24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h' }
  };

  function normalizeDateFormatValue(value) {
    const aliasMap = {
      MMDD: 'northAmerican12h',
      DDMM: 'westernEuropean24h',
      'DD.MM': 'centralEuropean24h',
      'DD-MM': 'dutch24h',
      westernEuropean12h: 'westernEuropean24h',
      eastAsian12h: 'eastAsian24h',
      southAsian24h: 'southAsian12h',
      latinAmerican12h: 'latinAmerican24h',
      southeastAsian12h: 'southeastAsian24h'
    };
    if (DATE_TIME_PRESETS[value]) return value;
    return aliasMap[value] || 'northAmerican12h';
  }

  function getDateFormatPattern() {
    const preset = DATE_TIME_PRESETS[normalizeDateFormatValue(dateFormat)] || DATE_TIME_PRESETS.northAmerican12h;
    return preset.dateFormat;
  }

  function formatDateParts(day, month, year, pattern) {
    const replacements = {
      YYYY: year,
      YY: year ? year.slice(-2) : '',
      MM: String(month).padStart(2, '0'),
      M: String(parseInt(month, 10)),
      DD: String(day).padStart(2, '0'),
      D: String(parseInt(day, 10))
    };

    return pattern.replace(/YYYY|YY|MM|M|DD|D/g, token => replacements[token] || token);
  }

  function getShortDatePattern(pattern) {
    const stripped = pattern
      .replace(/[\s./-]*YYYY\.?/g, '')
      .replace(/[\s./-]*YY\.?/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return stripped || pattern;
  }

  // Convert date format
  function convertDateFormat(dateStr, hasYear = false) {
    const pattern = getDateFormatPattern();

    const fullDateMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (fullDateMatch) {
      return formatDateParts(fullDateMatch[2], fullDateMatch[1], fullDateMatch[3], pattern);
    }

    const shortYearMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
    if (shortYearMatch) {
      return formatDateParts(shortYearMatch[2], shortYearMatch[1], shortYearMatch[3], pattern);
    }

    if (!hasYear) {
      const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
      if (slashMatch) {
        return formatDateParts(slashMatch[2], slashMatch[1], '', getShortDatePattern(pattern));
      }
    }

    const monthNameMatch = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i);
    if (monthNameMatch) {
      const monthNames = {
        january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
        july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
      };
      const month = monthNames[monthNameMatch[1].toLowerCase()];
      const day = monthNameMatch[2];
      const year = monthNameMatch[3];
      return formatDateParts(day, month, year, pattern);
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
    if (normalizeDateFormatValue(dateFormat) !== 'northAmerican12h') {
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
    if (normalizeDateFormatValue(dateFormat) === 'northAmerican12h' && timeFormat === '12h') {
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

  function isEventInformationPage() {
    return /\/events\/[^/]+\/information(?:$|[?#])/.test(window.location.pathname + window.location.search);
  }

  function findEventCardBody() {
    const dateNode = document.querySelector('coyo-event-date');
    if (dateNode) {
      const cardBody = dateNode.closest('cui-card-body');
      if (cardBody) return cardBody;
    }
    return null;
  }

  function getEventDetailsFromDOM() {
    const title = normalizeWhitespace(document.querySelector('main h1')?.textContent || '');
    const description = normalizeWhitespace(
      document.querySelector('h3 + div p')?.textContent ||
      document.querySelector('h3 + div')?.textContent ||
      ''
    );
    const location = normalizeWhitespace(
      document.querySelector('coyo-event-location .event-place')?.textContent ||
      document.querySelector('coyo-event-location')?.textContent ||
      ''
    );
    const dateText = normalizeWhitespace(document.querySelector('coyo-event-date')?.textContent || '');
    const hostH3 = [...document.querySelectorAll('h3')].find(h => /^host$/i.test(normalizeWhitespace(h.textContent)));
    const host = normalizeWhitespace(hostH3?.nextElementSibling?.textContent || '');
    return { title, description, location, dateText, host };
  }

  function parseDateFromDateText(dateText) {
    const numeric = (dateText || '').match(/\d{1,4}/g);
    if (!numeric || numeric.length < 3) return null;

    let year = null;
    let month = null;
    let day = null;
    const pattern = getDateFormatPattern();

    if (/^Y/.test(pattern)) {
      year = parseInt(numeric[0], 10);
      month = parseInt(numeric[1], 10);
      day = parseInt(numeric[2], 10);
    } else if (/^D/.test(pattern)) {
      day = parseInt(numeric[0], 10);
      month = parseInt(numeric[1], 10);
      year = parseInt(numeric[2], 10);
    } else {
      month = parseInt(numeric[0], 10);
      day = parseInt(numeric[1], 10);
      year = parseInt(numeric[2], 10);
    }

    if (!year || !month || !day) return null;
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }

  function parseTimeRangeFromDateText(dateText) {
    const matches = [...(dateText || '').matchAll(/(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm))?/g)];
    if (matches.length === 0) return { start: null, end: null };

    const to24 = (h, m, p) => {
      let hours = parseInt(h, 10);
      const minutes = parseInt(m, 10);
      if (p) {
        const period = p.toUpperCase();
        if (period === 'AM' && hours === 12) hours = 0;
        if (period === 'PM' && hours !== 12) hours += 12;
      }
      return { hours, minutes };
    };

    const start = to24(matches[0][1], matches[0][2], matches[0][3]);
    const end = matches[1] ? to24(matches[1][1], matches[1][2], matches[1][3]) : null;
    return { start, end };
  }

  function buildCalendarDate(details) {
    const d = parseDateFromDateText(details.dateText);
    if (!d) return null;

    const times = parseTimeRangeFromDateText(details.dateText);

    // All-day event: no time found in the date text.
    if (!times.start) {
      // Check for an end date (multi-day all-day event) by looking for a second date in the text.
      const numeric = (details.dateText || '').match(/\d{1,4}/g) || [];
      const pattern = getDateFormatPattern();
      let endDate = null;
      // A multi-day range has at least 6 numeric tokens (day/month/year twice).
      if (numeric.length >= 6) {
        let ey, em, ed;
        if (/^Y/.test(pattern)) {
          ey = parseInt(numeric[3], 10); em = parseInt(numeric[4], 10); ed = parseInt(numeric[5], 10);
        } else if (/^D/.test(pattern)) {
          ed = parseInt(numeric[3], 10); em = parseInt(numeric[4], 10); ey = parseInt(numeric[5], 10);
        } else {
          em = parseInt(numeric[3], 10); ed = parseInt(numeric[4], 10); ey = parseInt(numeric[5], 10);
        }
        if (ey && em && ed) {
          if (ey < 100) ey += 2000;
          // Google Calendar all-day end date is exclusive (day after last day).
          endDate = new Date(ey, em - 1, ed + 1);
        }
      }
      const start = new Date(d.year, d.month - 1, d.day);
      const end = endDate || new Date(d.year, d.month - 1, d.day + 1);
      return { start, end, allDay: true };
    }

    const start = new Date(d.year, d.month - 1, d.day, times.start.hours, times.start.minutes, 0);
    const end = times.end
      ? new Date(d.year, d.month - 1, d.day, times.end.hours, times.end.minutes, 0)
      : new Date(start.getTime() + (60 * 60 * 1000));

    return { start, end, allDay: false };
  }

  function formatGoogleDate(date) {
    const p = (v) => String(v).padStart(2, '0');
    return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
  }

  function formatGoogleAllDay(date) {
    const p = (v) => String(v).padStart(2, '0');
    return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  }

  function openGoogleCalendar(details, dateRange) {
    const startStr = dateRange.allDay ? formatGoogleAllDay(dateRange.start) : formatGoogleDate(dateRange.start);
    const endStr   = dateRange.allDay ? formatGoogleAllDay(dateRange.end)   : formatGoogleDate(dateRange.end);
    const body = [details.description, details.host ? `Host: ${details.host}` : ''].filter(Boolean).join('\n\n');
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: details.title || 'Event',
      dates: `${startStr}/${endStr}`,
      details: body,
      location: details.location || '',
      sprop: window.location.href
    });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank', 'noopener');
  }

  function formatOutlookDateLocal(date) {
    const p = (v) => String(v).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:00`;
  }

  function formatOutlookAllDay(date) {
    const p = (v) => String(v).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }

  function openOutlookCalendar(details, dateRange) {
    const startStr = dateRange.allDay ? formatOutlookAllDay(dateRange.start) : formatOutlookDateLocal(dateRange.start);
    const endStr   = dateRange.allDay ? formatOutlookAllDay(dateRange.end)   : formatOutlookDateLocal(dateRange.end);
    const body = [details.description, details.host ? `Host: ${details.host}` : ''].filter(Boolean).join('\n\n');
    const params = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      startdt: startStr,
      enddt: endStr,
      subject: details.title || 'Event',
      body,
      location: details.location || ''
    });
    window.open(`https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`, '_blank', 'noopener');
  }

  function openYahooCalendar(details, dateRange) {
    const p = (v) => String(v).padStart(2, '0');
    const formatYahoo = (date) =>
      `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}00`;
    const formatYahooAllDay = (date) =>
      `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
    const startStr = dateRange.allDay ? formatYahooAllDay(dateRange.start) : formatYahoo(dateRange.start);
    const endStr   = dateRange.allDay ? formatYahooAllDay(dateRange.end)   : formatYahoo(dateRange.end);
    const body = [details.description, details.host ? `Host: ${details.host}` : ''].filter(Boolean).join('\n\n');
    const params = new URLSearchParams({
      v: '60',
      title: details.title || 'Event',
      st: startStr,
      et: endStr,
      desc: body,
      in_loc: details.location || ''
    });
    window.open(`https://calendar.yahoo.com/?${params.toString()}`, '_blank', 'noopener');
  }

  function showIcsHint(anchor) {
    const existing = document.getElementById('haiiloEnhancerCalendarHint');
    if (existing) existing.remove();

    const hint = document.createElement('div');
    hint.id = 'haiiloEnhancerCalendarHint';
    hint.textContent = 'ICS file downloaded. Open it from your browser downloads to import it.';
    hint.style.marginTop = '8px';
    hint.style.fontSize = '12px';
    hint.style.color = '#555';
    anchor.appendChild(hint);

    window.setTimeout(() => {
      if (hint.parentElement) hint.remove();
    }, 5000);
  }

  function triggerHaiiloDownloadAndHint(anchor) {
    const buttons = [...document.querySelectorAll('button')];
    const downloadButton = buttons.find(btn => /download event/i.test(normalizeWhitespace(btn.textContent || '')));
    if (downloadButton) {
      downloadButton.click();
      showIcsHint(anchor);
    }
  }

  function toggleCalendarMenu(trigger, menu) {
    const nextDisplay = menu.style.display === 'none' ? 'block' : 'none';
    menu.style.display = nextDisplay;
    trigger.setAttribute('aria-expanded', String(nextDisplay === 'block'));
  }

  function findDownloadEventCatButton() {
    // Haiilo renders option buttons as CAT-BUTTON web components.
    return [...document.querySelectorAll('cat-button')].find(
      btn => /download event/i.test(normalizeWhitespace(btn.textContent || ''))
    ) || null;
  }

  function injectAddToCalendarAction() {
    if (!extensionEnabled) return;
    if (!isEventInformationPage()) return;

    // Bail out early if already injected.
    if (document.querySelector('[data-haiilo-enhancer-calendar="true"]')) return;

    const downloadCatBtn = findDownloadEventCatButton();
    if (!downloadCatBtn) return;

    // The CAT-BUTTON sits directly in a <li class="ng-star-inserted"> inside the Options <ul>.
    const downloadItem = downloadCatBtn.closest('li') || downloadCatBtn.parentElement;
    const optionsList = downloadItem.parentElement;

    // Find the Share event CAT-BUTTON for style reference.
    const shareCatBtn = [...document.querySelectorAll('cat-button')].find(
      btn => /share event/i.test(normalizeWhitespace(btn.textContent || ''))
    );
    const shareItem = shareCatBtn ? (shareCatBtn.closest('li') || shareCatBtn.parentElement) : downloadItem;

    // ------------------------------------------------------------------
    // Build a new <li> that mirrors the structure: <li> <button> ... </button> <dropdown> </li>
    // The CAT-BUTTON inner button uses: display:flex, width:100%, padding:10px 12px,
    // font: 15px Lato, cursor:pointer, border:none, background:transparent.
    // We replicate those styles on a plain <button> so it looks identical.
    // ------------------------------------------------------------------
    const newLi = document.createElement('li');
    newLi.className = shareItem.className;
    newLi.setAttribute('data-haiilo-enhancer-calendar', 'true');
    newLi.style.position = 'relative';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.setAttribute('aria-expanded', 'false');
    // Match the inner CAT-BUTTON shadow button styles exactly.
    trigger.style.cssText = [
      'display:flex',
      'align-items:center',
      'width:100%',
      'padding:10px 12px',
      'margin:0',
      'border:none',
      'background:transparent',
      'cursor:pointer',
      'font-size:15px',
      'font-family:Lato, system-ui, -apple-system, "Segoe UI", sans-serif',
      'color:inherit',
      'text-align:left',
      'box-sizing:border-box',
    ].join(';');
    const calIcon = document.createElement('cat-icon');
    calIcon.setAttribute('icon', 'calendar-outlined');
    calIcon.setAttribute('size', 'l');
    calIcon.style.marginRight = '8px';
    calIcon.style.flexShrink = '0';
    trigger.appendChild(calIcon);
    trigger.appendChild(document.createTextNode('Add to calendar'));

    trigger.addEventListener('mouseenter', () => { trigger.style.background = 'rgba(0,0,0,0.04)'; });
    trigger.addEventListener('mouseleave', () => { trigger.style.background = 'transparent'; });

    // Dropdown menu.
    const menu = document.createElement('ul');
    menu.setAttribute('data-haiilo-enhancer-calendar-menu', 'true');
    menu.style.display = 'none';
    menu.style.position = 'absolute';
    menu.style.left = '0';
    menu.style.top = '100%';
    menu.style.zIndex = '9999';
    menu.style.listStyle = 'none';
    menu.style.margin = '0';
    menu.style.padding = '4px 0';
    menu.style.background = '#fff';
    menu.style.border = '1px solid #e5e5e5';
    menu.style.borderRadius = '6px';
    menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
    menu.style.minWidth = '180px';

    const makeMenuAction = (label, onClick) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.display = 'block';
      btn.style.width = '100%';
      btn.style.textAlign = 'left';
      btn.style.padding = '8px 16px';
      btn.style.border = 'none';
      btn.style.background = 'transparent';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '14px';
      btn.style.fontFamily = 'inherit';
      btn.addEventListener('mouseenter', () => { btn.style.background = '#f5f5f5'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });
      btn.addEventListener('click', onClick);
      li.appendChild(btn);
      return li;
    };

    menu.appendChild(makeMenuAction('Google Calendar', () => {
      const details = getEventDetailsFromDOM();
      const dateRange = buildCalendarDate(details);
      if (!dateRange) return;
      openGoogleCalendar(details, dateRange);
      menu.style.display = 'none';
      trigger.setAttribute('aria-expanded', 'false');
    }));

    menu.appendChild(makeMenuAction('Outlook.com', () => {
      const details = getEventDetailsFromDOM();
      const dateRange = buildCalendarDate(details);
      if (!dateRange) return;
      openOutlookCalendar(details, dateRange);
      menu.style.display = 'none';
      trigger.setAttribute('aria-expanded', 'false');
    }));

    menu.appendChild(makeMenuAction('Yahoo Calendar', () => {
      const details = getEventDetailsFromDOM();
      const dateRange = buildCalendarDate(details);
      if (!dateRange) return;
      openYahooCalendar(details, dateRange);
      menu.style.display = 'none';
      trigger.setAttribute('aria-expanded', 'false');
    }));

    menu.appendChild(makeMenuAction('Download ICS file', () => {
      // Click Haiilo's native CAT-BUTTON for Download event.
      const dlBtn = findDownloadEventCatButton();
      if (dlBtn) dlBtn.click();
      menu.style.display = 'none';
      trigger.setAttribute('aria-expanded', 'false');
      showIcsHint(newLi);
    }));

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCalendarMenu(trigger, menu);
    });

    // Close menu when clicking outside.
    document.addEventListener('click', (e) => {
      if (!newLi.contains(e.target)) {
        menu.style.display = 'none';
        trigger.setAttribute('aria-expanded', 'false');
      }
    }, true);

    newLi.appendChild(trigger);
    newLi.appendChild(menu);

    // Insert before the Download event list item.
    optionsList.insertBefore(newLi, downloadItem);
  }

  function setupCalendarActionObserver() {
    if (calendarActionObserver) {
      calendarActionObserver.disconnect();
    }

    calendarActionObserver = new MutationObserver(() => {
      injectAddToCalendarAction();
    });

    calendarActionObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  injectAddToCalendarAction();
  setupCalendarActionObserver();
})();
