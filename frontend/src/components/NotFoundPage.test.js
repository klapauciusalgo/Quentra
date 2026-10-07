import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pageSource = fs.readFileSync(path.join(here, 'NotFoundPage.jsx'), 'utf8');
const indexSource = fs.readFileSync(path.join(here, '..', 'index.css'), 'utf8');
const overlaySource = fs.readFileSync(path.join(here, 'ProOnlyOverlay.jsx'), 'utf8');
const appSource = fs.readFileSync(path.join(here, '..', 'App.jsx'), 'utf8');

test('404 page provides an English safe-state recovery action and route map', () => {
  assert.match(pageSource, /Route out of the map/);
  assert.match(pageSource, /Back to Signal Floor/);
  assert.match(pageSource, /No position changed/);
  assert.match(pageSource, /aria-label="Quentra route map"/);
  assert.match(pageSource, /onClick=\{onGoHome\}/);
});

test('404 page only traverses Quentra-owned history and reduces nonessential motion', () => {
  assert.match(pageSource, /const historyState = window\.history\.state/);
  assert.match(pageSource, /isQuentraHistoryState\(historyState\)/);
  assert.equal((pageSource.match(/aria-label="Quentra route map"/g) || []).length, 1);
  assert.match(indexSource, /\.not-found-traveller[\s\S]*display: none/);
});

test('random paths resolve to the not-found route', () => {
  assert.match(appSource, /const getRouteMode = \(pathname = '\/'\)/);
  assert.match(appSource, /return 'not-found';/);
  assert.match(appSource, /viewMode === 'not-found'/);
});

test('root index alias resolves to the landing route', () => {
  assert.match(appSource, /normalizedPath === '\/index\.html'/);
});
test('Upgrade to Pro points to the intentionally unavailable billing route', () => {
  assert.match(overlaySource, /pushState\(\{ viewMode: 'not-found' \}, '', '\/billing'\)/);
  assert.match(overlaySource, /aria-label="Upgrade to Pro"/);
});
