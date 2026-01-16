// Content script for Hush for Haiilo

(function() {
  'use strict';

  let mutedUsers = [];
  let hiddenCount = 0;
  let lastRightClickedUser = null;
  let observer = null;

  // Initialize
  init();

  async function init() {
    await loadMutedUsers();
    setupMutationObserver();
    setupRightClickListener();
    hideContent();

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'refreshFilter') {
        loadMutedUsers().then(() => {
          showAllContent();
          hideContent();
        });
        sendResponse({ success: true });
      }

      if (message.action === 'getHiddenCount') {
        sendResponse({ count: hiddenCount });
      }

      if (message.action === 'getLastRightClickedUser') {
        sendResponse({ userName: lastRightClickedUser });
      }

      if (message.action === 'getUserNameFromElement') {
        sendResponse({ userName: lastRightClickedUser });
      }

      return true;
    });
  }

  async function loadMutedUsers() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getMutedUsers' });
      mutedUsers = response || [];
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
        // Debounce the filtering
        clearTimeout(window.hushFilterTimeout);
        window.hushFilterTimeout = setTimeout(() => {
          hideContent();
        }, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function setupRightClickListener() {
    document.addEventListener('contextmenu', (e) => {
      lastRightClickedUser = null;

      // Try to find username from the clicked element or its ancestors
      const userName = findUserNameFromElement(e.target);
      if (userName) {
        lastRightClickedUser = userName;
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

    const normalizedName = userName.toLowerCase().trim();
    return mutedUsers.some(user => {
      const mutedName = user.name.toLowerCase().trim();
      return normalizedName === mutedName || normalizedName.includes(mutedName) || mutedName.includes(normalizedName);
    });
  }

  function showAllContent() {
    // Remove all hidden classes and show everything
    document.querySelectorAll('.hush-hidden').forEach(el => {
      el.classList.remove('hush-hidden');
      el.style.display = '';
    });
    hiddenCount = 0;
  }

  function hideContent() {
    if (mutedUsers.length === 0) {
      updateBadge();
      return;
    }

    hiddenCount = 0;

    // Hide timeline posts (coyo-timeline-item)
    document.querySelectorAll('coyo-timeline-item').forEach(item => {
      if (item.classList.contains('hush-hidden')) return;

      const authorLink = item.querySelector('cat-sender-link');
      if (authorLink && isUserMuted(authorLink.textContent.trim())) {
        hideElement(item);
      }
    });

    // Hide comments (coyo-comment)
    document.querySelectorAll('coyo-comment').forEach(comment => {
      if (comment.classList.contains('hush-hidden')) return;

      const authorLink = comment.querySelector('[data-test="comment-author"]');
      if (authorLink && isUserMuted(authorLink.textContent.trim())) {
        hideElement(comment);
      }
    });

    // Hide blog posts and articles
    document.querySelectorAll('[class*="blog-post"], [class*="article-item"], [class*="news-item"]').forEach(item => {
      if (item.classList.contains('hush-hidden')) return;

      const authorElement = item.querySelector('[class*="author"], [class*="creator"], [class*="user-name"]');
      if (authorElement && isUserMuted(authorElement.textContent.trim())) {
        hideElement(item);
      }
    });

    // Hide feed items with various patterns
    document.querySelectorAll('[class*="feed-item"], [class*="post-item"], [class*="activity-item"]').forEach(item => {
      if (item.classList.contains('hush-hidden')) return;

      // Look for author in various places
      const authorSelectors = [
        'cat-sender-link',
        '[data-test="comment-author"]',
        '[class*="author"]',
        '[class*="user-name"]',
        '[class*="sender"]',
        'a[href*="/user/"]',
        'a[href*="/profile/"]'
      ];

      for (const selector of authorSelectors) {
        const authorElement = item.querySelector(selector);
        if (authorElement && isUserMuted(authorElement.textContent.trim())) {
          hideElement(item);
          break;
        }
      }
    });

    // Hide messages in chat/messaging areas
    document.querySelectorAll('[class*="message-item"], [class*="chat-message"]').forEach(item => {
      if (item.classList.contains('hush-hidden')) return;

      const authorElement = item.querySelector('[class*="sender"], [class*="author"], [class*="user"]');
      if (authorElement && isUserMuted(authorElement.textContent.trim())) {
        hideElement(item);
      }
    });

    updateBadge();
  }

  function hideElement(element) {
    element.classList.add('hush-hidden');
    element.style.display = 'none';
    hiddenCount++;
  }

  function updateBadge() {
    try {
      chrome.runtime.sendMessage({
        action: 'updateHiddenCount',
        count: hiddenCount
      });
    } catch (e) {
      // Extension context might be invalid
    }
  }
})();
