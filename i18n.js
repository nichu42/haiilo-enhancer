// Shared catalog loader for extension pages, service workers, and content scripts.
(function (root) {
  'use strict';

  const supportedLanguages = ['browser', 'en', 'de', 'cs', 'es', 'fr', 'hu', 'it', 'nl', 'pl'];
  let catalog = {};
  let languagePreference = 'browser';
  let catalogLocale = 'en';
  let loadPromise = null;

  function getBrowserAPI() {
    return typeof browser !== 'undefined' ? browser : chrome;
  }

  function normalizeLanguage(value) {
    return supportedLanguages.includes(value) ? value : 'browser';
  }

  function getBrowserLocale() {
    try {
      const api = getBrowserAPI();
      if (api.i18n && typeof api.i18n.getUILanguage === 'function') {
        return api.i18n.getUILanguage();
      }
    } catch (error) {
      // Fall through to navigator.language.
    }
    return typeof navigator !== 'undefined' ? navigator.language : 'en';
  }

  function localeCandidates(preference) {
    const requested = preference === 'browser' ? getBrowserLocale() : preference;
    const normalized = String(requested || 'en').replace('_', '-').toLowerCase();
    const base = normalized.split('-')[0];
    const candidates = [];
    if (supportedLanguages.includes(normalized)) candidates.push(normalized);
    if (supportedLanguages.includes(base)) candidates.push(base);
    if (!candidates.includes('en')) candidates.push('en');
    return candidates;
  }

  async function fetchCatalog(locale) {
    const api = getBrowserAPI();
    const url = api.runtime.getURL(`_locales/${locale}/messages.json`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load locale catalog ${locale}`);
    return response.json();
  }

  async function loadCatalog(preference) {
    const normalizedPreference = normalizeLanguage(preference);
    languagePreference = normalizedPreference;
    loadPromise = (async () => {
      for (const locale of localeCandidates(normalizedPreference)) {
        try {
          catalog = await fetchCatalog(locale);
          catalogLocale = locale;
          return catalog;
        } catch (error) {
          // Try the next locale, then use the native API as a final fallback.
        }
      }
      catalog = {};
      catalogLocale = 'en';
      return catalog;
    })();
    return loadPromise;
  }

  async function initializeI18n(preference) {
    if (preference === undefined) {
      try {
        const api = getBrowserAPI();
        const data = await api.storage.local.get('settings');
        preference = data && data.settings && data.settings.language;
      } catch (error) {
        preference = undefined;
      }
    }
    return loadCatalog(preference || 'browser');
  }

  function substitute(message, substitutions) {
    if (substitutions === undefined || substitutions === null) return message;
    const values = Array.isArray(substitutions) ? substitutions : [substitutions];
    let index = 0;
    const replacements = {};
    return message.replace(/\$([A-Z0-9_]+)\$/g, (match, name) => {
      if (!Object.prototype.hasOwnProperty.call(replacements, name)) {
        replacements[name] = values[index++];
      }
      return replacements[name] === undefined ? match : String(replacements[name]);
    });
  }

  function i18nMessage(key, substitutions) {
    const entry = catalog[key];
    if (entry && typeof entry.message === 'string') {
      return substitute(entry.message, substitutions);
    }
    try {
      const api = getBrowserAPI();
      const value = api.i18n && api.i18n.getMessage(key, substitutions);
      return value || key;
    } catch (error) {
      return key;
    }
  }

  function localizeDocument(rootElement) {
    if (typeof document === 'undefined') return;
    const root = rootElement || document;
    root.querySelectorAll('[data-i18n]').forEach(element => {
      element.textContent = i18nMessage(element.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      element.placeholder = i18nMessage(element.dataset.i18nPlaceholder);
    });
    root.querySelectorAll('[data-i18n-title]').forEach(element => {
      element.title = i18nMessage(element.dataset.i18nTitle);
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
      element.setAttribute('aria-label', i18nMessage(element.dataset.i18nAriaLabel));
    });
    if (document.documentElement) {
      document.documentElement.lang = catalogLocale;
    }
  }

  root.HaiiloI18n = {
    supportedLanguages,
    initializeI18n,
    loadCatalog,
    i18nMessage,
    localizeDocument,
    getLanguagePreference: () => languagePreference,
    getCatalogLocale: () => catalogLocale,
    getLoadPromise: () => loadPromise
  };
  root.i18nMessage = i18nMessage;
  root.localizeDocument = localizeDocument;
  root.initializeI18n = initializeI18n;
  root.loadI18nCatalog = loadCatalog;

  if (typeof document !== 'undefined') {
    const initializeDocument = () => initializeI18n().then(() => localizeDocument());
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeDocument, { once: true });
    } else {
      initializeDocument();
    }
  }
})(globalThis);
