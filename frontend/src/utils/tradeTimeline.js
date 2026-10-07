function parseTradeTimestamp(value) {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }

  const raw = String(value).trim();
  if (!raw || raw.toUpperCase().includes('RUNNING')) return 0;

  const normalized = raw
    .replace(/\s+UTC$/i, 'Z')
    .replace(' ', 'T');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function tradeLifecycleTimestamp(trade) {
  if (!trade || typeof trade !== 'object') return 0;

  const exitTimestamp = parseTradeTimestamp(trade.exit_time);
  if (exitTimestamp > 0) return exitTimestamp;
  return parseTradeTimestamp(trade.entry_time);
}

function tradeNumber(trade) {
  const parsed = Number(trade?.trade_no);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortTradesByLifecycle(trades, order = 'DESC') {
  const direction = order === 'ASC' ? 1 : -1;
  return (Array.isArray(trades) ? trades : [])
    .map((trade, originalIndex) => ({ trade, originalIndex }))
    .sort((left, right) => {
      const timestampDiff = tradeLifecycleTimestamp(left.trade) - tradeLifecycleTimestamp(right.trade);
      if (timestampDiff !== 0) return direction * timestampDiff;

      const tradeNumberDiff = tradeNumber(left.trade) - tradeNumber(right.trade);
      if (tradeNumberDiff !== 0) return direction * tradeNumberDiff;

      return left.originalIndex - right.originalIndex;
    })
    .map(({ trade }) => trade);
}
