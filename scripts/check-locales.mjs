import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const localeRoot = path.join(root, '_locales');
const source = JSON.parse(fs.readFileSync(path.join(localeRoot, 'en', 'messages.json'), 'utf8'));
const sourceKeys = new Set(Object.keys(source));
const requiredLanguageKeys = [
  'languageSettings',
  'language',
  'languageBrowser',
  'languageEnglish',
  'languageGerman',
  'languageCzech',
  'languageSpanish',
  'languageFrench',
  'languageHungarian',
  'languageItalian',
  'languageDutch',
  'languagePolish'
];
const errors = [];

for (const key of requiredLanguageKeys) {
  if (!sourceKeys.has(key)) errors.push(`en: missing language selector message "${key}"`);
}

for (const locale of fs.readdirSync(localeRoot, { withFileTypes: true })) {
  if (!locale.isDirectory()) continue;
  const file = path.join(localeRoot, locale.name, 'messages.json');
  if (!fs.existsSync(file)) {
    errors.push(`${locale.name}: missing messages.json`);
    continue;
  }
  const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const key of sourceKeys) {
    if (!messages[key] || typeof messages[key].message !== 'string') {
      errors.push(`${locale.name}: missing message "${key}"`);
    }
  }
  for (const key of Object.keys(messages)) {
    if (!sourceKeys.has(key)) errors.push(`${locale.name}: unknown message "${key}"`);
  }
  for (const [key, entry] of Object.entries(source)) {
    const placeholders = [...entry.message.matchAll(/\$([A-Z0-9_]+)\$/g)].map(match => match[1]).sort();
    const localized = [...(messages[key]?.message || '').matchAll(/\$([A-Z0-9_]+)\$/g)].map(match => match[1]).sort();
    if (placeholders.join(',') !== localized.join(',')) {
      errors.push(`${locale.name}: placeholder mismatch for "${key}"`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Locale catalogs valid: ${[...sourceKeys].length} messages across ${fs.readdirSync(localeRoot).length} locales.`);
