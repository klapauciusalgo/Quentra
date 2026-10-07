import test from 'node:test';
import assert from 'node:assert/strict';
import { sortTradesByLifecycle, tradeLifecycleTimestamp } from './tradeTimeline.js';

test('closed trades sort by exit time, not by trade number', () => {
  const trades = [
    { trade_no: 451, entry_time: '2026-10-04 08:00:00 UTC', exit_time: '2026-10-04 12:00:00 UTC', status: 'CLOSED' },
    { trade_no: 449, entry_time: '2026-10-06 02:30:00 UTC', exit_time: '2026-10-06 03:00:00 UTC', status: 'CLOSED' },
  ];

  assert.deepEqual(sortTradesByLifecycle(trades, 'DESC').map((trade) => trade.trade_no), [449, 451]);
});

test('running trades sort by entry time and preserve deterministic trade-number ties', () => {
  const trades = [
    { trade_no: 451, entry_time: '2026-10-04 08:00:00 UTC', exit_time: 'RUNNING', status: 'OPEN' },
    { trade_no: 450, entry_time: '2026-10-04 08:00:00 UTC', exit_time: 'RUNNING', status: 'OPEN' },
  ];

  assert.deepEqual(sortTradesByLifecycle(trades, 'ASC').map((trade) => trade.trade_no), [450, 451]);
  assert.equal(tradeLifecycleTimestamp(trades[0]), Date.parse('2026-10-04T08:00:00Z'));
});
