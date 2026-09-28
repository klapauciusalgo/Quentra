import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeNotification,
  sortNotificationsNewestFirst,
  getClosedTradeEventKey,
  buildHistoricalTradeNotifications,
  reconcileClosedTrades,
} from './notificationUtils.js';

test('uses the signal event time instead of the platform-open time', () => {
  const notification = normalizeNotification({
    type: 'NEW_SIGNAL',
    strategy_id: 'demo',
    entry_time: '2026-09-25 13:30:00',
  }, 1790352000000);

  assert.equal(notification.event_time, '2026-09-25 13:30:00');
  assert.equal(notification.timestamp, '25 Sep 2026, 20:30:00');
});

test('uses an explicit backend event timestamp for protection events', () => {
  const notification = normalizeNotification({
    type: 'BREAKEVEN_LOCKED',
    strategy_id: 'demo',
    event_time: '2026-09-25T18:30:00Z',
  }, 1790352000000);

  assert.equal(notification.timestamp, '26 Sep 2026, 01:30:00');
});

test('sorts recent signal events by actual event time, newest first', () => {
  const sorted = sortNotificationsNewestFirst([
    { id: 'older', event_time: '2026-09-25 13:30:00' },
    { id: 'newer', event_time: '2026-09-26T01:00:00Z' },
    { id: 'middle', event_time: 1790352000000 },
  ]);

  assert.deepEqual(sorted.map((item) => item.id), ['newer', 'middle', 'older']);
});

test('falls back to notification arrival time only when no event time exists', () => {
  const notification = normalizeNotification({
    type: 'PARTIAL_TAKE_PROFIT',
    strategy_id: 'demo',
  }, 1790352000000);

  assert.equal(notification.event_time, 1790352000000);
  assert.equal(notification.timestamp, '25 Sep 2026, 23:00:00');
});

test('builds a stable identity for a closed trade reconciliation event', () => {
  const key = getClosedTradeEventKey('BTCUSDT', 'pippo-30m-grd', {
    trade_no: 727,
    exit_time: '2026-09-28 00:30:00',
    exit_price: 84140,
  });

  assert.equal(key, 'SIGNAL_EXIT:BTCUSDT:pippo-30m-grd:727:2026-09-28 00:30:00:84140');
});

test('rebuilds the latest buy and close notifications from persisted trade telemetry', () => {
  const events = buildHistoricalTradeNotifications('BTCUSDT', {
    strategy_id: 'pippo-30m-grd',
    name: 'Pippo 30m Grd',
    direction: 'LONG',
    last_closed_trade: {
      trade_no: 726,
      side: 'LONG',
      entry_time: '2026-09-25 10:30:00',
      exit_time: '2026-09-25 13:30:00',
      entry_price: 84713.66,
      exit_price: 83923.71,
      net_return_pct: -1.11,
      exit_reason: 'Force_Close_MA',
    },
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'NEW_SIGNAL');
  assert.equal(events[0].title, 'BUY ENTRY: Pippo 30m Grd');
  assert.equal(events[1].type, 'SIGNAL_EXIT');
  assert.equal(events[1].event_key, 'SIGNAL_EXIT:BTCUSDT:pippo-30m-grd:726:2026-09-25 13:30:00:83923.71');
});

test('reconciles a newly closed trade even when no active position remains', () => {
  const seen = new Map();
  const seenTradeNumbers = new Map();
  const initial = [{
    strategy_id: 'pippo-30m-grd',
    name: 'Pippo 30m Grd',
    last_closed_trade: { trade_no: 726, exit_time: '2026-09-27 00:00:00', exit_price: 85000 },
  }];
  const closed = [{
    strategy_id: 'pippo-30m-grd',
    name: 'Pippo 30m Grd',
    last_closed_trade: { trade_no: 727, exit_time: '2026-09-28 00:30:00', exit_price: 84140 },
  }];

  assert.deepEqual(reconcileClosedTrades('BTCUSDT', initial, seen, seenTradeNumbers), []);
  const events = reconcileClosedTrades('BTCUSDT', closed, seen, seenTradeNumbers);

  assert.equal(events.length, 1);
  assert.equal(events[0].strategy_id, 'pippo-30m-grd');
  assert.equal(events[0].event_key, 'SIGNAL_EXIT:BTCUSDT:pippo-30m-grd:727:2026-09-28 00:30:00:84140');
  const sameTradeWithEnrichedTimestamp = [{
    ...closed[0],
    last_closed_trade: { trade_no: 727, exit_time: '2026-09-28 00:30:01', exit_price: 84141 },
  }];
  assert.deepEqual(reconcileClosedTrades('BTCUSDT', sameTradeWithEnrichedTimestamp, seen, seenTradeNumbers), []);
  assert.deepEqual(reconcileClosedTrades('BTCUSDT', closed, seen, seenTradeNumbers), []);
});
