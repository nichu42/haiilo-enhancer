// shared.js — Canonical constants and helpers shared by background, content,
// and options scripts. Load this file first in every context (importScripts,
// content-script injection arrays, HTML <script> tags) so all three use the
// exact same values — a single source of truth. Keep duplicated logic here,
// not copy-pasted into the other scripts.
//
// Works in the browser (globalThis) and in Node for unit tests (test/).
(function (root) {
  'use strict';

  // Date/time format presets. The <select> in options.html exposes a subset
  // of these (translated via data-i18n); the full table is used by the
  // background script for locale defaults and by the content script for
  // on-page date/time conversion.
  const DATE_TIME_PRESETS = {
    northAmerican12h: { dateFormat: 'MM/DD/YYYY', timeFormat: '12h', label: 'MM/DD/YYYY (North American)' },
    westernEuropean12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h', label: 'DD/MM/YYYY (Western European)' },
    westernEuropean24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', label: 'DD/MM/YYYY (Western European)' },
    centralEuropean24h: { dateFormat: 'DD.MM.YYYY', timeFormat: '24h', label: 'DD.MM.YYYY (Central European)' },
    dutch24h: { dateFormat: 'DD-MM-YYYY', timeFormat: '24h', label: 'DD-MM-YYYY (Dutch)' },
    iso860124h: { dateFormat: 'YYYY-MM-DD', timeFormat: '24h', label: 'YYYY-MM-DD (ISO 8601)' },
    eastAsian12h: { dateFormat: 'YYYY/MM/DD', timeFormat: '12h', label: 'YYYY/MM/DD (East Asian)' },
    eastAsian24h: { dateFormat: 'YYYY/MM/DD', timeFormat: '24h', label: 'YYYY/MM/DD (East Asian)' },
    hungarian24h: { dateFormat: 'YYYY. MM. DD.', timeFormat: '24h', label: 'YYYY. MM. DD. (Hungarian)' },
    finnish24h: { dateFormat: 'D.M.YYYY', timeFormat: '24h', label: 'D.M.YYYY (Finnish)' },
    spacedCentral24h: { dateFormat: 'D. M. YYYY', timeFormat: '24h', label: 'D. M. YYYY (Central European)' },
    dottedSlavic24h: { dateFormat: 'D.M.YYYY.', timeFormat: '24h', label: 'D.M.YYYY. (Central European)' },
    spacedSlavic24h: { dateFormat: 'D. M. YYYY.', timeFormat: '24h', label: 'D. M. YYYY. (Central European)' },
    korean24h: { dateFormat: 'YYYY. M. D.', timeFormat: '24h', label: 'YYYY. M. D. (Korean)' },
    southAsian12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h', label: 'DD/MM/YYYY (South Asian)' },
    southAsian24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', label: 'DD/MM/YYYY (South Asian)' },
    latinAmerican12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h', label: 'DD/MM/YYYY (Latin American)' },
    latinAmerican24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', label: 'DD/MM/YYYY (Latin American)' },
    middleEastern24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', label: 'DD/MM/YYYY (Middle Eastern)' },
    southeastAsian12h: { dateFormat: 'DD/MM/YYYY', timeFormat: '12h', label: 'DD/MM/YYYY (Southeast Asian)' },
    southeastAsian24h: { dateFormat: 'DD/MM/YYYY', timeFormat: '24h', label: 'DD/MM/YYYY (Southeast Asian)' }
  };

  const MESSENGER_PANEL_WIDTH_MIN_PERCENT = 50;
  const MESSENGER_PANEL_WIDTH_MAX_PERCENT = 125;
  const MESSENGER_PANEL_WIDTH_DEFAULT_PERCENT = 100;

  // Normalize a stored dateFormat value (preset id or legacy alias) to a
  // valid preset id. Falls back to the North American preset for unknowns.
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

  // Clamp the messenger panel width percentage to the allowed range
  // (50-125, default 100). Returns the default for non-numeric input.
  function clampMessengerPanelWidthPercent(value) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return MESSENGER_PANEL_WIDTH_DEFAULT_PERCENT;
    return Math.max(MESSENGER_PANEL_WIDTH_MIN_PERCENT, Math.min(MESSENGER_PANEL_WIDTH_MAX_PERCENT, parsed));
  }

  // Flat list of presets as { value, dateFormat, timeFormat, label }.
  function getDateTimePresetOptions() {
    return Object.entries(DATE_TIME_PRESETS).map(([value, preset]) => ({ value, ...preset }));
  }

  // Build the group-people badge icon (two overlapping circles + person)
  // used on channel avatars. Requires a DOM; pass `doc` explicitly in
  // non-browser contexts (e.g. unit tests).
  function buildGroupBadgeSVG(svgSize, doc) {
    const documentRef = doc || root.document;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = documentRef.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', svgSize);
    svg.setAttribute('height', svgSize);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'white');
    svg.style.display = 'block';

    const c1 = documentRef.createElementNS(svgNS, 'circle');
    c1.setAttribute('cx', '8');
    c1.setAttribute('cy', '8');
    c1.setAttribute('r', '4');

    const c2 = documentRef.createElementNS(svgNS, 'circle');
    c2.setAttribute('cx', '16');
    c2.setAttribute('cy', '8');
    c2.setAttribute('r', '4');

    const p = documentRef.createElementNS(svgNS, 'path');
    p.setAttribute('d', 'M12 14c-3 0-5 1.5-5 3v1h10v-1c0-1.5-2-3-5-3z');

    svg.appendChild(c1);
    svg.appendChild(c2);
    svg.appendChild(p);
    return svg;
  }

  root.HaiiloShared = {
    DATE_TIME_PRESETS,
    MESSENGER_PANEL_WIDTH_MIN_PERCENT,
    MESSENGER_PANEL_WIDTH_MAX_PERCENT,
    MESSENGER_PANEL_WIDTH_DEFAULT_PERCENT,
    normalizeDateFormatValue,
    clampMessengerPanelWidthPercent,
    getDateTimePresetOptions,
    buildGroupBadgeSVG
  };
})(globalThis);
