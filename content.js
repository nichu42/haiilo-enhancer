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
  let dateFormat = 'MMDD'; // 'MMDD', 'DDMM', 'DD.MM', 'DD-MM'
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
        let currentAside = null;
        const reattach = (sidebar) => {
          const aside = sidebar.querySelector('aside.sidebar-container');
          if (aside === currentAside) return;
          // The observer can only observe one target; re-create it.
          messengerReopenObserver.disconnect();
          currentAside = aside;
          if (!aside) return;
          messengerReopenObserver.observe(aside, {
            attributes: true,
            attributeFilter: ['class']
          });
          debugLog('[Content] Messenger re-open observer attached to aside');
        };

        messengerReopenObserver = new MutationObserver(() => {
          if (!keepMessengerExpandedActive) return;
          const sidebar = document.querySelector('coyo-messaging-sidebar, coyo-messaging-panel');
          if (!sidebar) return;
          reattach(sidebar);
          reopenMessengerIfClosed();
        });

        // Initial attach: observe the sidebar host for childList changes.
        const initialSidebar = document.querySelector('coyo-messaging-sidebar, coyo-messaging-panel');
        if (initialSidebar) {
          messengerReopenObserver.observe(initialSidebar, {
            childList: true,
            subtree: false
          });
          reattach(initialSidebar);
        } else {
          // Sidebar not in DOM yet; wait for it via a tiny temp observer.
          const tempObs = new MutationObserver(() => {
            const sidebar = document.querySelector('coyo-messaging-sidebar, coyo-messaging-panel');
            if (sidebar) {
              tempObs.disconnect();
              messengerReopenObserver.observe(sidebar, { childList: true, subtree: false });
              reattach(sidebar);
              debugLog('[Content] Messenger re-open observer attached (delayed)');
            }
          });
          tempObs.observe(document.body, { childList: true, subtree: true });
        }
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
          dateFormat = settings.dateFormat || 'MMDD';
          timeFormat = settings.timeFormat || '12h';
          autoExpandEnabled = settings.autoExpandEnabled === true;
          const rawClicks = parseInt(settings.autoExpandClicksPerList, 10);
          autoExpandClicksPerList = isNaN(rawClicks) ? 3 : Math.max(0, Math.min(10, rawClicks));
          const rawDelay = parseInt(settings.autoExpandDelayMs, 10);
          autoExpandDelayMs = isNaN(rawDelay) ? 300 : Math.max(100, Math.min(1000, rawDelay));
          autoExpandScope = normalizeAutoExpandScope(settings.autoExpandScope);
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
