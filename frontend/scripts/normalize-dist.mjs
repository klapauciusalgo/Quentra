import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg']);

function normalize(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      normalize(absolute);
      continue;
    }
    if (!textExtensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
      continue;
    }
    const source = readFileSync(absolute, 'utf8');
    const normalized = source.replace(/[ \t]+$/gm, '');
    if (normalized !== source) {
      writeFileSync(absolute, normalized);
    }
  }
}

normalize(dist);
