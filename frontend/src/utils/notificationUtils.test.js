import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeNotification } from './notificationUtils.js';

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

test('falls back to notification arrival time only when no event time exists', () => {
  const notification = normalizeNotification({
    type: 'PARTIAL_TAKE_PROFIT',
    strategy_id: 'demo',
  }, 1790352000000);

  assert.equal(notification.event_time, 1790352000000);
  assert.equal(notification.timestamp, '25 Sep 2026, 23:00:00');
});
