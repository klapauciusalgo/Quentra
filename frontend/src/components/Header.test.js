import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const headerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'Header.jsx');
const headerSource = fs.readFileSync(headerPath, 'utf8');

function getHeaderInnerClassName() {
  const match = headerSource.match(/<div className="([^"]*min-h-14[^"]*)"/);
  return match?.[1] || '';
}

test('header does not clip the notification flyout vertically', () => {
  assert.doesNotMatch(getHeaderInnerClassName(), /overflow-hidden/);
});
