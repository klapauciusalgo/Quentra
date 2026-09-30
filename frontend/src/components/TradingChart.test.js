import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'TradingChart.jsx'), 'utf8');

test('protected floor ticket never formats missing execution levels', () => {
  assert.match(source, /status === 'PROTECTED'/);
  assert.match(source, /Live execution levels are available to verified Pro users\./);
  assert.doesNotMatch(source, /direction \|\| 'LONG'/);
});
