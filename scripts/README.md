# Scripts

Local build and lint helpers for the extension.

## Console-output lint

`lint-console.mjs` enforces one rule: every `console.log`, `console.warn`,
`console.info`, and `console.debug` call must live inside a function named
`debugLog()`. `console.error` is allowed unconditionally (genuine errors
should be visible even with debug mode off).

This keeps the dev console clean by default — with `debugMode: false` in
storage, **no informational logs ever reach the page console**.

**What it does:**

- Parses `background.js`, `content.js`, `popup.js`, `options.js`
- Locates the body of every `function debugLog` / `debugLog =` declaration
- Walks every `console.<method>(...)` call and flags the ones that are
  not inside a `debugLog` body

**Run it directly:**

```sh
node scripts/lint-console.mjs
```

**Wired into the build:**

- `build.ps1` and `build.sh` run it as a pre-build step. They exit
  non-zero on violations. Pass `-SkipLint` (PowerShell) or `SKIP_LINT=1`
  (Bash) to bypass in an emergency.

**Wired into commits:**

- `scripts/pre-commit` is the git pre-commit hook. It runs the lint on
  the JS files that are staged in the current commit. Exits non-zero
  on violations, blocking the commit.
- One-time install: `sh scripts/install-hooks.sh`
  (copies `scripts/pre-commit` to `.git/hooks/pre-commit` and `chmod +x`s it).
- Bypass for a single commit: `git commit --no-verify`
