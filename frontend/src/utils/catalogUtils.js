const LIVE_STATUSES = new Set(['OPEN', 'RUNNING', 'ACTIVE', 'IN_POSITION']);
const RESTRICTED_MARKER_EVENTS = new Set(['breakeven', 'stop_loss', 'take_profit']);
const PUBLIC_TRADE_KEYS = new Set([
  'trade_no',
  'side',
  'type',
  'entry_time',
  'exit_time',
  'entry_price',
  'exit_price',
  'gross_return_pct',
  'net_return_pct',
  'exit_reason',
  'reason',
  'status',
]);
const PUBLIC_MARKER_KEYS = new Set([
  'time',
  'position',
  'color',
  'shape',
  'text',
  'size',
  'entryPrice',
  'exitPrice',
  'pnlPct',
  'tradeNo',
  'side',
  'eventType',
  'reason',
]);

function normalized(value) {
  return String(value || '').trim().toLowerCase().replaceAll('_', ' ');
}

function isLiveTrade(trade) {
  return LIVE_STATUSES.has(String(trade?.status || '').toUpperCase())
    || LIVE_STATUSES.has(String(trade?.position_status || '').toUpperCase())
    || String(trade?.exit_time || '').toUpperCase() === 'RUNNING'
    || trade?.is_active === true;
}

function publicExitReason(value) {
  if (value === undefined || value === null || value === '') return value;
  const reason = normalized(value);
  if (reason.includes('breakeven') || reason.includes('be locked') || reason.startsWith('be ')) {
    return 'Protected Exit';
  }
  if (
    reason.includes('force close')
    || reason.includes('regime')
    || reason.includes('structure')
    || reason.includes('choc')
    || reason.includes('ma55')
    || reason.endsWith(' ma')
  ) {
    return 'Regime Exit';
  }
  if (reason.includes('stop loss') || reason.startsWith('stop')) return 'Risk Exit';
  if (reason.includes('take profit') || reason.startsWith('tp')) return 'Target Exit';
  return 'Market Exit';
}

function sanitizeTrade(trade) {
  if (!trade || typeof trade !== 'object' || isLiveTrade(trade)) return null;
  const isTerminal = ['CLOSED', 'EXITED', 'FLAT'].includes(String(trade.status || '').toUpperCase())
    || trade.exit_time
    || trade.exit_price !== undefined
    || trade.exit_reason
    || trade.reason;
  if (!isTerminal) return null;
  const result = Object.fromEntries(
    Object.entries(trade).filter(([key]) => PUBLIC_TRADE_KEYS.has(key)),
  );
  result.status ||= 'CLOSED';
  if ('exit_reason' in result) result.exit_reason = publicExitReason(result.exit_reason);
  if ('reason' in result) result.reason = publicExitReason(result.reason);
  return result;
}

function sanitizeMarker(marker, allowedTradeNumbers) {
  if (!marker || typeof marker !== 'object') return null;
  const eventType = normalized(marker.eventType || marker.event_type);
  const text = normalized(marker.text);
  if (
    marker.isActive === true
    || marker.isBreakeven === true
    || RESTRICTED_MARKER_EVENTS.has(eventType)
    || String(marker.status || '').toUpperCase() === 'OPEN'
    || text.includes('breakeven')
    || text.includes('be locked')
    || text.startsWith('active ')
  ) return null;

  const tradeNo = marker.tradeNo ?? marker.trade_no;
  if (tradeNo !== undefined && tradeNo !== null && !allowedTradeNumbers.has(String(tradeNo))) {
    return null;
  }
  const result = Object.fromEntries(
    Object.entries(marker).filter(([key]) => PUBLIC_MARKER_KEYS.has(key)),
  );
  if ('reason' in result) result.reason = publicExitReason(result.reason);
  if (eventType === 'exit' || eventType === 'close' || text.startsWith('exit ') || text.startsWith('close ')) {
    result.text = tradeNo !== undefined && tradeNo !== null ? `EXIT #${tradeNo}` : 'EXIT';
    result.eventType = 'exit';
  } else if (eventType === 'entry') {
    result.text = tradeNo !== undefined && tradeNo !== null ? `ENTRY #${tradeNo}` : 'ENTRY';
    result.eventType = 'entry';
  }
  return result;
}

export function stripLiveState(catalog) {
  if (!Array.isArray(catalog)) return [];

  return catalog.map((strategy) => {
    const trades = Array.isArray(strategy?.trades)
      ? strategy.trades.map(sanitizeTrade).filter(Boolean)
      : [];
    const allowedTradeNumbers = new Set(
      trades
        .map((trade) => trade.trade_no)
        .filter((tradeNo) => tradeNo !== undefined && tradeNo !== null)
        .map(String),
    );
    const markers = Array.isArray(strategy?.markers)
      ? strategy.markers.map((marker) => sanitizeMarker(marker, allowedTradeNumbers)).filter(Boolean)
      : [];

    const result = { ...strategy };
    delete result.logic_summary;
    delete result.recommended_for;
    delete result.parameters;
    delete result.active_ticket;
    result.has_active_signal = false;
    result.active_ticket = null;
    result.trades = trades;
    result.markers = markers;
    if (result.metrics && typeof result.metrics === 'object') {
      result.metrics = { ...result.metrics, total_trades: trades.length };
    }
    if ('trades_count' in result) result.trades_count = trades.length;
    return result;
  });
}
