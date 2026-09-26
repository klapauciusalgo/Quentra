import test from 'node:test';
import assert from 'node:assert/strict';

import { getProcessedMarkers, isMarkerActive, normalizeMarkerTime } from './chartMarkers.js';

test('collapses duplicate live entry and breakeven markers by event identity', () => {
  const entryTime = 1789736400;
  const breakevenTime = 1789740000;
  const markers = [
    { time: entryTime, shape: 'arrowUp', side: 'LONG', entryPrice: 80073.09, tradeNo: 66, status: 'OPEN', isActive: false },
    { time: entryTime, shape: 'arrowUp', side: 'LONG', entryPrice: 80073.09, tradeNo: 66, status: 'OPEN', isActive: false },
    { time: entryTime, shape: 'arrowUp', side: 'LONG', entryPrice: 80073.09, tradeNo: 66, status: 'OPEN', isActive: true },
    { time: breakevenTime, shape: 'circle', exitPrice: 80233.24, tradeNo: 66, isBreakeven: true, isActive: false },
    { time: breakevenTime, shape: 'circle', exitPrice: 80233.24, isBreakeven: true },
  ];
  const candles = [{ time: entryTime }, { time: breakevenTime }];

  const result = getProcessedMarkers(markers, candles, 'compact');

  assert.equal(result.length, 2);
  assert.equal(result.filter((marker) => marker.text === 'ACTIVE BUY #66').length, 1);
  assert.equal(result.filter((marker) => marker.text === 'BE LOCKED').length, 1);
  assert.equal(result.find((marker) => marker.shape === 'arrowUp').isActive, true);
});

test('explicit inactive state takes precedence over stale OPEN status', () => {
  assert.equal(isMarkerActive({ status: 'OPEN', isActive: false }), false);
  assert.equal(isMarkerActive({ status: 'OPEN' }), true);
});

test('keeps distinct events on the same candle without inventing timestamps', () => {
  const candleTime = 1789736400;
  const result = getProcessedMarkers([
    { time: candleTime + 10, shape: 'arrowUp', side: 'LONG', entryPrice: 100, tradeNo: 1 },
    { time: candleTime + 20, shape: 'circle', exitPrice: 101, tradeNo: 1, pnlPct: 1 },
  ], [{ time: candleTime }, { time: candleTime + 3600 }], 'compact');

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((marker) => marker.time), [candleTime, candleTime]);
});

test('normalizes legacy datetime exit markers and keeps the close marker visible', () => {
  const exitTime = 1790343000;
  const result = getProcessedMarkers([
    { time: exitTime - 1800, shape: 'arrowUp', side: 'LONG', entryPrice: 84713.66, tradeNo: 444, isActive: false, status: 'CLOSED' },
    { time: '2026-09-25 13:30:00', shape: 'arrowDown', position: 'aboveBar', tradeNo: 444, exitPrice: 83923.71, pnlPct: -1.11, text: 'EXIT Force_Close_MA #444' },
  ], [
    { time: exitTime - 1800 },
    { time: exitTime },
  ], 'compact');

  assert.equal(normalizeMarkerTime('2026-09-25 13:30:00'), exitTime);
  assert.equal(result.length, 2);
  const exit = result.find((marker) => marker.tradeNo === 444 && marker.time === exitTime);
  assert.ok(exit);
  assert.equal(exit.text, '-1.1%');
});

test('does not classify a long exit arrow as a new entry when exit metadata exists', () => {
  const result = getProcessedMarkers([
    { time: 1790332200, shape: 'arrowDown', position: 'aboveBar', tradeNo: 444, exitPrice: 83923.71, pnlPct: -1.11, text: 'EXIT Force_Close_MA #444' },
  ], [{ time: 1790332200 }], 'compact');

  assert.equal(result.length, 1);
  assert.equal(result[0].text, '-1.1%');
  assert.equal(result[0].size, 1.5);
});
