# Scripts

Local build and lint helpers for the extension.

## Console-output lint

`lint-console.mjs` enforces one rule: every `console.log`, `console.warn`,
`console.info`, and `console.debug` call must live inside a function named
`debugLog()`. `console.error` is allowed unconditionally (genuine errors
should be visible even with debug mode off).

This keeps the dev console clean by default — with `debugMode: false` in
storage, **no informational logs ever reach the page console**.

## Locale catalog check

`check-locales.mjs` verifies that every `_locales` catalog contains the same
message IDs and placeholders as `_locales/en/messages.json`, including all
manual language selector labels.

```sh
node scripts/check-locales.mjs
```

`check-localized-html.mjs` verifies that elements marked with `data-i18n` do
not contain hard-coded visible text outside the language catalogs.

**What it does:**

- Parses `background.js`, `content.js`, `popup.js`, `options.js`, `i18n.js`, `shared.js`
- Locates the body of every `function debugLog` / `debugLog =` declaration
- Walks every `console.<method>(...)` call and flags the ones that are
  not inside a `debugLog` body

**Run it directly:**

```sh
node scripts/lint-console.mjs
```

Build scripts do not run this local-only lint; CI runs it on pushed code.

**Wired into commits:**

- `scripts/pre-commit` is the git pre-commit hook. It runs the lint on
  the JS files that are staged in the current commit, validates staged
  locale catalogs and localized HTML, and runs the unit tests
  (`node --test`) on every commit. Exits non-zero on any violation,
  blocking the commit.
- One-time install: `sh scripts/install-hooks.sh`
  (copies `scripts/pre-commit` to `.git/hooks/pre-commit` and `chmod +x`s it).
- Bypass for a single commit: `git commit --no-verify`
