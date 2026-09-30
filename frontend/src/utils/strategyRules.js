export function getStrategyExecutionRules(strat, isProUser = false) {
  const timeframe = strat?.timeframe?.toUpperCase() || 'TIMEFRAME';

  if (!isProUser) {
    return {
      trigger: 'Pro-only rule set',
      triggerSub: 'Exact entry cadence restricted',
      regime: 'Protected filter',
      regimeSub: 'Upgrade to view',
      isRegimeOk: false,
      stopLoss: 'Protected',
      breakeven: 'Protected',
      takeProfit: 'Protected',
    };
  }

  const parameters = strat?.parameters || {};
  const first = (...keys) => keys
    .map((key) => parameters[key])
    .find((value) => value !== undefined && value !== null && value !== '');
  const regimeParts = [
    parameters.macro_filters,
    parameters.regime_filter,
    parameters.regime_1h,
    parameters.regime_4h,
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  const regimeStatus = [
    strat?.regime_aligned,
    strat?.regime_ok,
    strat?.active_ticket?.regime_aligned,
  ].find((value) => typeof value === 'boolean');

  return {
    trigger: first('entry_swing', 'entry_breakout', 'internal_swing') || 'Strategy-specific trigger',
    triggerSub: parameters.entry_breakout ? 'Verified breakout cadence' : `${timeframe} candle close`,
    regime: regimeParts.join(' · ') || 'Multi-timeframe regime filter',
    regimeSub: regimeStatus === undefined ? 'Verified by strategy engine' : (regimeStatus ? 'Regime aligned' : 'Regime watch'),
    isRegimeOk: regimeStatus,
    stopLoss: first('hard_stop_loss', 'stop_loss', 'hard_stop_loss_pct') || 'Strategy-specific risk limit',
    breakeven: first('breakeven_lock', 'breakeven', 'breakeven_trigger') || 'Strategy-specific protection rule',
    takeProfit: first('take_profit', 'take_profit_pct') || 'Strategy-specific target',
  };
}
