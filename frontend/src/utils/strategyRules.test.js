import test from 'node:test';
import assert from 'node:assert/strict';
import { getStrategyExecutionRules } from './strategyRules.js';

test('free strategy ribbon rules stay generic and do not expose exact values', () => {
  const rules = getStrategyExecutionRules({ id: 'pippo-30m-grd', timeframe: '30m' }, false);

  assert.equal(rules.trigger, 'Pro-only rule set');
  assert.equal(rules.regime, 'Protected filter');
  assert.equal(rules.stopLoss, 'Protected');
  assert.equal(rules.takeProfit, 'Protected');
  assert.equal(JSON.stringify(rules).includes('0.8%'), false);
});

test('Pro strategy ribbon rules are derived from the authorized payload', () => {
  const rules = getStrategyExecutionRules({
    timeframe: '30m',
    parameters: {
      entry_swing: '36 bars',
      regime_1h: 'Distance < 1.5%',
      hard_stop_loss: '2.0%',
      breakeven_lock: 'Force Close',
      take_profit: '20.0%',
    },
  }, true);

  assert.equal(rules.trigger, '36 bars');
  assert.equal(rules.regime, 'Distance < 1.5%');
  assert.equal(rules.stopLoss, '2.0%');
  assert.equal(rules.breakeven, 'Force Close');
  assert.equal(rules.takeProfit, '20.0%');
});

test('Pro ETH strategy rules support ETH-specific parameter names', () => {
  const rules = getStrategyExecutionRules({
    timeframe: '30m',
    parameters: {
      macro_filters: '4H SMA111 & 1H EMA50',
      entry_breakout: '36-bar High Breakout',
      stop_loss: '5.0%',
      breakeven: '+3.0% trigger -> BE+0.2%',
      take_profit: '75.0%',
    },
    regime_aligned: true,
  }, true);

  assert.equal(rules.trigger, '36-bar High Breakout');
  assert.equal(rules.triggerSub, 'Verified breakout cadence');
  assert.equal(rules.regime, '4H SMA111 & 1H EMA50');
  assert.equal(rules.isRegimeOk, true);
  assert.equal(rules.stopLoss, '5.0%');
  assert.equal(rules.breakeven, '+3.0% trigger -> BE+0.2%');
  assert.equal(rules.takeProfit, '75.0%');
});
