# Localization

The extension uses the native WebExtension `_locales/<locale>/messages.json`
catalog format. English (`en`) is the source catalog. The initial draft catalogs
cover German (`de`), Czech (`cs`), Spanish (`es`), French (`fr`), Hungarian
(`hu`), Italian (`it`), Dutch (`nl`), and Polish (`pl`); every catalog contains
every English key so missing translations fall back safely to English.

`i18n.js` loads the selected catalog from the extension's own `_locales`
resources and is shared by popup/options, the MV3 service worker, Firefox MV3,
and content scripts. The General settings language selector supports Browser
default plus English, German, Czech, Spanish, French, Hungarian, Italian,
Dutch, and Polish. Changing it persists the `language` setting, recreates
context menus, reloads extension pages, and reloads Haiilo tabs so generated UI
uses the new catalog. Manifest name, description, and toolbar title use
`__MSG_*__` placeholders. Browser locale negotiation and the extension's
existing date/time locale fallback remain independent.

Validate catalogs deterministically with:

```sh
node scripts/check-locales.mjs
```

Build scripts copy `_locales` into both Chrome MV3 and Firefox MV3 packages.

## POEditor

The public POEditor project is **Haiilo Enhancer** (project ID `836880`) with
English as the reference language and the same eight target languages as the
local catalogs. POEditor is the collaboration source for future corrections;
machine-translated drafts must be reviewed before release.

1. Import/synchronize `_locales/en/messages.json` as key-value terms.
2. Keep message IDs and `$PLACEHOLDER$` names unchanged.
3. Translate and review each target language in POEditor.
4. Export each translated catalog back to the matching
   `_locales/<locale>/messages.json`.
5. Run `node scripts/check-locales.mjs` and the browser builds before release.

POEditor exports must preserve WebExtension JSON format and not convert message
IDs into translated strings.
