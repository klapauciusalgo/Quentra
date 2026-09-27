import test from 'node:test';
import assert from 'node:assert/strict';

import { stripLiveState } from './catalogUtils.js';

test('removes live positions and markers from bundled fallback catalogs', () => {
  const catalog = stripLiveState([{
    id: 'demo',
    has_active_signal: true,
    active_ticket: { entry_price: 100 },
    trades: [
      { trade_no: 1, status: 'CLOSED' },
      { trade_no: 2, status: 'OPEN', exit_time: 'RUNNING' },
    ],
    markers: [
      { tradeNo: 1, eventType: 'exit', text: 'EXIT' },
      { tradeNo: 2, eventType: 'entry', isActive: true, text: 'ACTIVE LONG' },
      { tradeNo: 2, eventType: 'breakeven', isBreakeven: true },
    ],
  }]);

  assert.equal(catalog[0].has_active_signal, false);
  assert.equal(catalog[0].active_ticket, null);
  assert.deepEqual(catalog[0].trades, [{ trade_no: 1, status: 'CLOSED' }]);
  assert.deepEqual(catalog[0].markers, [{ tradeNo: 1, eventType: 'exit', text: 'EXIT' }]);
});

test('does not mutate the imported fallback catalog', () => {
  const original = [{ id: 'demo', has_active_signal: true, trades: [{ status: 'OPEN' }], markers: [] }];
  stripLiveState(original);

  assert.equal(original[0].has_active_signal, true);
  assert.equal(original[0].trades[0].status, 'OPEN');
});
