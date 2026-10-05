import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'worker.js'), 'utf8');

for (const forbidden of [
  '82654',
  '2648.68',
  'MACRO_DISCOUNT',
  'BULLISH_RECOVERY',
  'strategiesData',
  'strategiesDataEth',
]) {
  assert.equal(source.includes(forbidden), false, `worker.js contains forbidden edge data: ${forbidden}`);
}

assert.match(source, /Authoritative backend is unavailable/);
assert.match(source, /code: 'BACKEND_UNAVAILABLE'/);
assert.match(source, /function requiresAuthoritativeBackend\(pathname\)/);
assert.match(source, /function backendUnavailableResponse\(\)/);
assert.match(source, /status: 'OFFLINE'/);
assert.match(source, /signals_available: false/);

console.log('Worker security checks passed: no static proprietary floor/catalog fallback.');
