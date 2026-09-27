function isOpenTrade(trade) {
  const status = String(trade?.status || '').toUpperCase();
  return status === 'OPEN' || status === 'RUNNING' || trade?.exit_time === 'RUNNING';
}

function isLiveMarker(marker) {
  return marker?.isActive === true
    || marker?.isBreakeven === true
    || String(marker?.status || '').toUpperCase() === 'OPEN'
    || String(marker?.text || '').trim().toUpperCase().startsWith('ACTIVE');
}

export function stripLiveState(catalog) {
  if (!Array.isArray(catalog)) return [];

  return catalog.map((strategy) => ({
    ...strategy,
    has_active_signal: false,
    active_ticket: null,
    trades: Array.isArray(strategy.trades)
      ? strategy.trades.filter((trade) => !isOpenTrade(trade))
      : strategy.trades,
    markers: Array.isArray(strategy.markers)
      ? strategy.markers.filter((marker) => !isLiveMarker(marker))
      : strategy.markers,
  }));
}
