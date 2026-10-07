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

test('latest focus uses the first item in the newest-first timeline', () => {
  assert.match(source, /setFocusedTradeIndex\(0\)/);
  assert.doesNotMatch(source, /setFocusedTradeIndex\(timelineTrades\.length - 1\)/);
});

test('last-bar action focuses the newest timeline item', () => {
  assert.match(source, /const latestIdx = 0/);
  assert.doesNotMatch(source, /const latestIdx = timelineTrades\.length - 1/);
});

test('signal timeline uses lifecycle time instead of trade number for newest order', () => {
  assert.match(source, /sortTradesByLifecycle/);
  assert.match(source, /tradeLifecycleTimestamp/);
  assert.doesNotMatch(source, /const diff = \(a\.trade_no \|\| 0\) - \(b\.trade_no \|\| 0\)/);
});
