import fs from 'node:fs';
import path from 'node:path';

const files = ['popup.html', 'options.html'];
const errors = [];

for (const fileName of files) {
  const filePath = path.join(process.cwd(), fileName);
  const source = fs.readFileSync(filePath, 'utf8');
  const elements = source.matchAll(/<([a-z0-9-]+)\b[^>]*data-i18n="[^"]+"[^>]*>([\s\S]*?)<\/\1>/gi);

  for (const match of elements) {
    const content = match[2].replace(/<!--[\s\S]*?-->/g, '').trim();
    if (content) {
      errors.push(`${fileName}: localized <${match[1]}> contains hard-coded content`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log('Localized HTML contains no hard-coded element text.');
