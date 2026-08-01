// Unit tests for shared.js (HaiiloShared).
// Run with: node --test
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

// shared.js attaches to globalThis when loaded (no CommonJS exports).
require('../shared.js');
const S = globalThis.HaiiloShared;

const PRESET_COUNT = Object.keys(S.DATE_TIME_PRESETS).length;

test('DATE_TIME_PRESETS has the expected number of entries', () => {
  assert.strictEqual(PRESET_COUNT, 21);
});

test('every preset is structurally valid', () => {
  for (const [id, preset] of Object.entries(S.DATE_TIME_PRESETS)) {
    assert.ok(typeof preset.dateFormat === 'string', `${id}: dateFormat`);
    assert.match(preset.dateFormat, /YYYY/, `${id}: dateFormat contains YYYY`);
    assert.ok(preset.timeFormat === '12h' || preset.timeFormat === '24h', `${id}: timeFormat`);
    assert.ok(typeof preset.label === 'string', `${id}: label`);
  }
});

test('normalizeDateFormatValue keeps known preset ids unchanged', () => {
  for (const id of Object.keys(S.DATE_TIME_PRESETS)) {
    assert.strictEqual(S.normalizeDateFormatValue(id), id, id);
  }
});

test('normalizeDateFormatValue maps legacy aliases that are not preset ids', () => {
  const expected = {
    MMDD: 'northAmerican12h',
    DDMM: 'westernEuropean24h',
    'DD.MM': 'centralEuropean24h',
    'DD-MM': 'dutch24h'
  };
  for (const [alias, id] of Object.entries(expected)) {
    assert.strictEqual(S.normalizeDateFormatValue(alias), id, alias);
  }
});

test('normalizeDateFormatValue keeps preset ids intact even if listed in aliasMap', () => {
  // These are valid preset ids, so the aliasMap entries are unreachable and
  // the value must be preserved (documenting current behavior).
  const preserved = [
    'westernEuropean12h',
    'eastAsian12h',
    'southAsian24h',
    'latinAmerican12h',
    'southeastAsian12h'
  ];
  for (const id of preserved) {
    assert.strictEqual(S.normalizeDateFormatValue(id), id, id);
  }
});

test('normalizeDateFormatValue falls back for unknown values', () => {
  assert.strictEqual(S.normalizeDateFormatValue('bogus'), 'northAmerican12h');
  assert.strictEqual(S.normalizeDateFormatValue(undefined), 'northAmerican12h');
  assert.strictEqual(S.normalizeDateFormatValue(''), 'northAmerican12h');
  assert.strictEqual(S.normalizeDateFormatValue(null), 'northAmerican12h');
});

test('clampMessengerPanelWidthPercent clamps to the 50-125 range', () => {
  assert.strictEqual(S.clampMessengerPanelWidthPercent(50), 50);
  assert.strictEqual(S.clampMessengerPanelWidthPercent(125), 125);
  assert.strictEqual(S.clampMessengerPanelWidthPercent(75), 75);
  assert.strictEqual(S.clampMessengerPanelWidthPercent(49), 50);
  assert.strictEqual(S.clampMessengerPanelWidthPercent(126), 125);
  assert.strictEqual(S.clampMessengerPanelWidthPercent(-10), 50);
  assert.strictEqual(S.clampMessengerPanelWidthPercent(999), 125);
  assert.strictEqual(S.clampMessengerPanelWidthPercent('80'), 80);
});

test('clampMessengerPanelWidthPercent returns the default for non-numeric input', () => {
  assert.strictEqual(S.clampMessengerPanelWidthPercent(NaN), 100);
  assert.strictEqual(S.clampMessengerPanelWidthPercent('abc'), 100);
  assert.strictEqual(S.clampMessengerPanelWidthPercent(undefined), 100);
  assert.strictEqual(S.clampMessengerPanelWidthPercent(null), 100);
});

test('getDateTimePresetOptions returns one entry per preset, matching the table', () => {
  const options = S.getDateTimePresetOptions();
  assert.strictEqual(options.length, PRESET_COUNT);
  const ids = new Set(options.map(o => o.value));
  assert.strictEqual(ids.size, PRESET_COUNT, 'preset ids are unique');
  for (const option of options) {
    const preset = S.DATE_TIME_PRESETS[option.value];
    assert.strictEqual(option.dateFormat, preset.dateFormat);
    assert.strictEqual(option.timeFormat, preset.timeFormat);
    assert.strictEqual(option.label, preset.label);
  }
});

test('buildGroupBadgeSVG builds the group-people icon', () => {
  const namespaces = [];
  const makeEl = (name) => {
    const el = { name, attrs: {}, style: {}, children: [] };
    el.setAttribute = (k, v) => { el.attrs[k] = v; };
    el.appendChild = (child) => { el.children.push(child); };
    return el;
  };
  const doc = {
    createElementNS(ns, name) {
      namespaces.push(ns);
      return makeEl(name);
    }
  };

  const svg = S.buildGroupBadgeSVG(10, doc);

  assert.strictEqual(svg.name, 'svg');
  assert.strictEqual(svg.attrs.width, 10);
  assert.strictEqual(svg.attrs.height, 10);
  assert.strictEqual(svg.attrs.viewBox, '0 0 24 24');
  assert.strictEqual(svg.attrs.fill, 'white');
  assert.strictEqual(svg.style.display, 'block');
  assert.strictEqual(svg.children.length, 3);
  assert.strictEqual(svg.children[0].name, 'circle');
  assert.strictEqual(svg.children[1].name, 'circle');
  assert.strictEqual(svg.children[2].name, 'path');
  assert.strictEqual(svg.children[0].attrs.cx, '8');
  assert.strictEqual(svg.children[0].attrs.cy, '8');
  assert.strictEqual(svg.children[0].attrs.r, '4');
  assert.strictEqual(svg.children[2].attrs.d, 'M12 14c-3 0-5 1.5-5 3v1h10v-1c0-1.5-2-3-5-3z');
  assert.ok(namespaces.every(ns => ns === 'http://www.w3.org/2000/svg'), 'uses the SVG namespace');
});
