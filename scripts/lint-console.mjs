// Lint check: every console.log / console.warn / console.info / console.debug
// call in the extension's JS must be inside a function named `debugLog`.
// console.error is allowed unconditionally (genuine errors should be visible).
//
// Exits 0 if clean, 1 if violations are found.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');

const JS_FILES = [
  'background.js',
  'content.js',
  'popup.js',
  'options.js'
];

const FORBIDDEN = ['log', 'warn', 'info', 'debug'];
const ALLOWED_IN_DEBUGLOG = new Set(['error']);

// Find every call like `console.<method>(...)` (with optional leading whitespace).
// We deliberately keep this regex small and well-defined; the goal is to
// catch the common forms and not over-engineer.
const CALL_RE = /\bconsole\s*\.\s*(log|warn|info|debug|error)\s*\(/g;

// Match a top-level `function debugLog` or `debugLog =` declaration so we
// can suppress the check inside that function's body. We use brace
// matching to find the end of the function.
function findDebugLogRanges(source) {
  const ranges = [];
  const declRe = /\b(function\s+debugLog\b|debugLog\s*=\s*(?:function|\([^)]*\)\s*=>|\w+\s*=>))/g;
  let m;
  while ((m = declRe.exec(source)) !== null) {
    const start = m.index;
    // Find the opening brace of the function body. We need to skip past
    // any arrow function parameter list and the `=>` token.
    let i = m.index + m[0].length;
    while (i < source.length && source[i] !== '{') i++;
    if (i >= source.length) continue;
    // Now match braces from index i.
    let depth = 0;
    const bodyStart = i;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) {
          ranges.push([bodyStart, i + 1]);
          break;
        }
      }
    }
  }
  return ranges;
}

function isInsideAnyRange(offset, ranges) {
  for (const [a, b] of ranges) {
    if (offset >= a && offset < b) return true;
  }
  return false;
}

function lineCol(source, offset) {
  let line = 1, col = 1;
  for (let i = 0; i < offset; i++) {
    if (source[i] === '\n') { line++; col = 1; } else { col++; }
  }
  return { line, col };
}

let totalViolations = 0;

for (const file of JS_FILES) {
  const path = join(ROOT, file);
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch (e) {
    console.error(`lint: cannot read ${file}: ${e.message}`);
    totalViolations++;
    continue;
  }

  const debugLogRanges = findDebugLogRanges(source);
  const violations = [];

  CALL_RE.lastIndex = 0;
  let match;
  while ((match = CALL_RE.exec(source)) !== null) {
    const method = match[1];
    if (ALLOWED_IN_DEBUGLOG.has(method)) continue; // console.error is fine
    if (!FORBIDDEN.includes(method)) continue;

    if (isInsideAnyRange(match.index, debugLogRanges)) {
      // The call is inside a debugLog function — that's the wrapper
      // that gates on debugMode, so it's allowed.
      continue;
    }

    const { line, col } = lineCol(source, match.index);
    violations.push(`  ${file}:${line}:${col}  console.${method}(...)  (not inside debugLog)`);
  }

  if (violations.length > 0) {
    console.error(`\nlint: ${file} has ${violations.length} unguarded console call(s):`);
    for (const v of violations) console.error(v);
    totalViolations += violations.length;
  }
}

if (totalViolations > 0) {
  console.error(`\nlint FAILED: ${totalViolations} unguarded console call(s) found.`);
  console.error('Wrap them in debugLog() or change to console.error if they are real errors.');
  process.exit(1);
}

console.log(`lint: OK (${JS_FILES.length} files checked)`);
