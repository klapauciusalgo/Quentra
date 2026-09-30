import test from 'node:test';
import assert from 'node:assert/strict';
import { hasProAccess, stripProContent } from './proAccess.js';

test('free users do not receive pro content access', () => {
  assert.equal(hasProAccess(null), false);
  assert.equal(hasProAccess({ plan: 'free' }), false);
  assert.equal(hasProAccess({ role: 'user', subscription_status: 'active' }), false);
});

test('active pro users receive pro content access', () => {
  assert.equal(hasProAccess({ plan: 'pro', subscription_status: 'active' }), true);
  assert.equal(hasProAccess({ plan: 'pro' }), false);
  assert.equal(hasProAccess({ user_metadata: { plan: 'pro', subscription_status: 'active' } }), false);
  assert.equal(hasProAccess({ app_metadata: { plan: 'pro', subscription_status: 'active' } }), false);
});

test('cancelled or expired pro access is denied', () => {
  assert.equal(hasProAccess({ plan: 'pro', subscription_status: 'cancelled' }), false);
  assert.equal(hasProAccess({ plan: 'pro', subscription_status: 'inactive' }), false);
  assert.equal(hasProAccess({ plan: 'pro', subscription_status: 'pending' }), false);
  assert.equal(hasProAccess({ plan: 'pro', pro_expires_at: 'not-a-date' }), false);
  assert.equal(hasProAccess({ plan: 'pro', pro_expires_at: '2020-01-01T00:00:00.000Z' }), false);
});

test('plan matching is case-insensitive and does not trust arbitrary boolean flags', () => {
  assert.equal(hasProAccess({ plan: ' PRO ', subscription_status: 'ACTIVE' }), true);
  assert.equal(hasProAccess({ isPro: true }), false);
  assert.equal(hasProAccess({ role: 'pro', subscription_status: 'active' }), false);
  assert.equal(hasProAccess({ role: 'pro' }), false);
});

test('free strategy payloads are redacted without mutating the source', () => {
  const source = {
    id: 'pippo-30m-grd',
    logic_summary: 'secret thesis',
    recommended_for: 'secret profile',
    parameters: { entry_swing: 36 },
    active_ticket: { stop_loss: 95, take_profit: 120 },
    trades: [{
      status: 'CLOSED',
      entry_time: '2026-01-01 00:00:00',
      exit_time: '2026-01-01 01:00:00',
      stop_loss: 95,
      take_profit: 120,
      entry_price: 100,
      exit_price: 101,
    }, {
      status: 'OPEN',
      exit_time: 'RUNNING',
      entry_price: 200,
    }],
    markers: [{ eventType: 'breakeven', isBreakeven: true, text: 'BE LOCKED @ $102' }],
    metrics: { total_trades: 727 },
  };

  const redacted = stripProContent(source);

  assert.equal(redacted.logic_summary, null);
  assert.equal(redacted.recommended_for, null);
  assert.deepEqual(redacted.parameters, {});
  assert.equal(redacted.active_ticket, null);
  assert.equal(redacted.trades.length, 1);
  assert.equal(redacted.trades[0].status, 'CLOSED');
  assert.equal(redacted.trades[0].stop_loss, undefined);
  assert.equal(redacted.trades[0].take_profit, undefined);
  assert.deepEqual(redacted.markers, []);
  assert.deepEqual(source.parameters, { entry_swing: 36 });
  assert.deepEqual(redacted.metrics, { total_trades: 1 });
});
