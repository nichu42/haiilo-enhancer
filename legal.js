// legal.js — Inline viewer for the AGPLv3 license and the privacy policy.
//
// The documents themselves are plain files (LICENSE, PRIVACY.md) that the
// build scripts copy into the extension package; this script fetches them at
// runtime instead of duplicating the text in JS. The popup and options pages
// both load this file and share the same modal markup (the #legalModal
// overlay). Triggers carry a data-legal-doc="license|privacy" attribute.
//
// Works in the browser (globalThis) only — it is not part of the Node test
// suite, so keep it free of any module imports.
(function (root) {
  'use strict';

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  const DOCS = {
    license: { file: 'LICENSE', title: 'GNU Affero General Public License', markdown: false },
    privacy: { file: 'PRIVACY.md', title: 'Privacy Policy', markdown: true }
  };

  const LOADING_TEXT = 'Loading…';
  const ERROR_TEXT = 'Could not load the document.';

  let lastFocusedElement = null;

  function getModal() {
    return document.getElementById('legalModal');
  }

  function cleanInline(text) {
    return text.replace(/\*\*/g, '').replace(/`/g, '').trim();
  }

  // Plain-text headings (AGPL-style): ALL-CAPS titles, numbered section
  // headings like "1. Source Code." (which may run long, e.g. section 13),
  // and short standalone titles such as "Preamble". Long lines are always
  // treated as body text.
  function isHeadingLine(line) {
    if (/^\d+\.\s+[A-Z]/.test(line)) return true;
    if (line.length > 70) return false;
    if (/^[A-Z][A-Z0-9 .-]+$/.test(line)) return true;
    return line.length <= 40 && /^[A-Za-z][A-Za-z0-9 ']*$/.test(line) && !line.endsWith('.');
  }

  function renderDocument(container, text, markdown) {
    container.textContent = '';
    const lines = text.split('\n');
    let paragraph = [];
    let bullets = [];

    const flushParagraph = () => {
      if (paragraph.length > 0) {
        const p = document.createElement('p');
        p.textContent = paragraph.join(' ').replace(/\s+/g, ' ').trim();
        container.appendChild(p);
        paragraph = [];
      }
    };

    const flushBullets = () => {
      if (bullets.length > 0) {
        const ul = document.createElement('ul');
        bullets.forEach(item => {
          const li = document.createElement('li');
          li.textContent = item;
          ul.appendChild(li);
        });
        container.appendChild(ul);
        bullets = [];
      }
    };

    lines.forEach(rawLine => {
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        flushBullets();
        return;
      }
      if (markdown && line.startsWith('#')) {
        flushParagraph();
        flushBullets();
        const h = document.createElement('h3');
        h.textContent = cleanInline(line.replace(/^#+\s*/, ''));
        container.appendChild(h);
        return;
      }
      if (isHeadingLine(line)) {
        flushParagraph();
        flushBullets();
        const h = document.createElement('h3');
        h.textContent = cleanInline(line);
        container.appendChild(h);
        return;
      }
      if (line.startsWith('- ')) {
        flushParagraph();
        bullets.push(cleanInline(line.slice(2)));
        return;
      }
      flushBullets();
      paragraph.push(cleanInline(line));
    });

    flushParagraph();
    flushBullets();
  }

  function focusableElements(dialog) {
    return Array.from(dialog.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null || el === document.activeElement);
  }

  function openLegalModal(doc) {
    const modal = getModal();
    const config = DOCS[doc];
    if (!modal || !config) return;

    const titleEl = document.getElementById('legalModalTitle');
    const bodyEl = document.getElementById('legalModalBody');
    if (titleEl) titleEl.textContent = config.title;
    if (bodyEl) bodyEl.textContent = LOADING_TEXT;

    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    fetch(browserAPI.runtime.getURL(config.file))
      .then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(text => renderDocument(bodyEl, text, config.markdown))
      .catch(() => {
        if (bodyEl) bodyEl.textContent = ERROR_TEXT;
      })
      .then(() => {
        const closeBtn = modal.querySelector('[data-legal-close]');
        if (closeBtn) closeBtn.focus();
      });
  }

  function closeLegalModal() {
    const modal = getModal();
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }

  function initLegalModals() {
    const modal = getModal();
    if (!modal) return;

    // Delegated click handling so triggers added after init (e.g. the
    // localized Data & Privacy intro link built by options.js) still work.
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-legal-doc]');
      if (trigger) openLegalModal(trigger.dataset.legalDoc);
    });

    modal.querySelectorAll('[data-legal-close]').forEach(btn => {
      btn.addEventListener('click', closeLegalModal);
    });

    modal.addEventListener('click', event => {
      if (event.target === modal) closeLegalModal();
    });

    document.addEventListener('keydown', event => {
      if (modal.hidden) return;
      if (event.key === 'Escape') {
        closeLegalModal();
        return;
      }
      if (event.key === 'Tab') {
        const dialog = modal.querySelector('.legal-dialog');
        if (!dialog) return;
        const items = focusableElements(dialog);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  root.HaiiloLegal = { openLegalModal, closeLegalModal, initLegalModals, renderDocument };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initLegalModals, { once: true });
    } else {
      initLegalModals();
    }
  }
})(globalThis);
