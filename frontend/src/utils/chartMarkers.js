export function normalizeMarkerTime(rawTime) {
  if (typeof rawTime === 'number' && Number.isFinite(rawTime)) {
    return rawTime > 1e12 ? Math.floor(rawTime / 1000) : Math.floor(rawTime);
  }

  if (typeof rawTime !== 'string' || !rawTime.trim()) return null;
  const text = rawTime.trim();
  if (/^\d+(\.\d+)?$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric)
      ? (numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric))
      : null;
  }

  const normalized = text.endsWith(' UTC')
    ? `${text.slice(0, -4).trim()}Z`
    : /(?:Z|[+-]\d{2}:?\d{2})$/.test(text)
      ? text
      : `${text.replace(' ', 'T')}Z`;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function markerEventType(marker) {
  if (marker.isBreakeven) return 'breakeven';
  if (marker.eventType === 'entry' || marker.eventType === 'exit') return marker.eventType;
  if (marker.entryPrice !== undefined && marker.entryPrice !== null) return 'entry';
  if (
    marker.exitPrice !== undefined && marker.exitPrice !== null
    || marker.pnlPct !== undefined && marker.pnlPct !== null
    || /^\s*(EXIT|CLOSE)/i.test(String(marker.text || ''))
  ) return 'exit';
  // Legacy markers without price metadata used arrowUp/arrowDown for entries.
  return marker.shape === 'arrowUp' || marker.shape === 'arrowDown' ? 'entry' : 'exit';
}

function markerPrice(marker) {
  const value = marker.entryPrice ?? marker.exitPrice;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(8) : '';
}

function markerIdentity(marker) {
  const eventType = markerEventType(marker);
  const side = marker.side || (marker.shape === 'arrowUp' ? 'LONG' : marker.shape === 'arrowDown' ? 'SHORT' : '');
  const price = markerPrice(marker);
  const fallbackTradeNo = price ? '' : (marker.tradeNo ?? '');
  return [normalizeMarkerTime(marker.time) ?? marker.time, eventType, side, price, fallbackTradeNo].join('|');
}

function markerPriority(marker) {
  let priority = 0;
  if (marker.isActive === true) priority += 8;
  if (marker.tradeNo !== undefined && marker.tradeNo !== null) priority += 4;
  if (marker.status === 'OPEN') priority += 2;
  if (marker.isActive === false) priority += 1;
  return priority;
}

export function isMarkerActive(marker) {
  if (marker.isActive === true) return true;
  if (marker.isActive === false) return false;
  return marker.status === 'OPEN';
}

export function deduplicateMarkers(markers) {
  const unique = new Map();

  markers.forEach((marker) => {
    const key = markerIdentity(marker);
    const existing = unique.get(key);
    if (!existing || markerPriority(marker) > markerPriority(existing)) {
      unique.set(key, marker);
    }
  });

  return [...unique.values()];
}

export function formatMarkersForDisplay(rawMarkers, mode) {
  return rawMarkers.map((marker) => {
    const isEntry = markerEventType(marker) === 'entry';
    const isLong = marker.side === 'LONG' || marker.shape === 'arrowUp';
    const isActive = isMarkerActive(marker);
    let text = '';

    if (mode === 'minimal') {
      text = isActive ? (isLong ? 'BUY' : 'SELL') : '';
    } else if (mode === 'prices') {
      if (isEntry && marker.entryPrice) text = `$${Math.round(marker.entryPrice).toLocaleString()}`;
      else if (!isEntry && marker.exitPrice) text = `$${Math.round(marker.exitPrice).toLocaleString()}`;
    } else if (mode === 'full') {
      text = marker.text || '';
    } else if (isActive && isEntry) {
      text = isLong ? `ACTIVE BUY #${marker.tradeNo || ''}` : `ACTIVE SELL #${marker.tradeNo || ''}`;
    } else if (marker.isBreakeven) {
      text = 'BE LOCKED';
    } else if (isEntry) {
      text = isLong ? `BUY #${marker.tradeNo || ''}` : `SELL #${marker.tradeNo || ''}`;
    } else {
      const pnl = marker.pnlPct !== undefined ? marker.pnlPct : null;
      text = pnl !== null ? `${pnl > 0 ? '+' : ''}${Number(pnl).toFixed(1)}%` : 'EXIT';
    }

    return {
      ...marker,
      text,
      size: isActive ? 3 : (isEntry ? 2 : 1.5),
      color: isActive ? (isLong ? '#30D158' : '#FF453A') : (marker.isBreakeven ? '#FF9F0A' : marker.color),
    };
  });
}

export function getProcessedMarkers(rawMarkers, candleArr, mode) {
  if (!rawMarkers?.length || !candleArr?.length) return [];

  const candleTimes = candleArr
    .map((candle) => normalizeMarkerTime(candle.time))
    .filter((time) => time !== null);
  if (!candleTimes.length) return [];
  const minTime = candleTimes[0];
  const maxTime = candleTimes[candleTimes.length - 1];
  const averageInterval = candleTimes.length > 1
    ? (maxTime - minTime) / (candleTimes.length - 1)
    : 1800;

  const inRange = deduplicateMarkers(rawMarkers)
    .map((marker) => ({ ...marker, time: normalizeMarkerTime(marker.time) }))
    .filter((marker) => marker.time !== null)
    .filter((marker) => (
      marker.time >= minTime - averageInterval && marker.time <= maxTime + averageInterval * 2
    ));

  const mapped = inRange.map((marker) => {
    let low = 0;
    let high = candleTimes.length - 1;
    let bestIndex = 0;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (candleTimes[middle] <= marker.time) {
        bestIndex = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    return {
      ...marker,
      time: candleTimes[bestIndex],
      originalTime: marker.time,
    };
  });

  mapped.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (isMarkerActive(a) && !isMarkerActive(b)) return 1;
    if (!isMarkerActive(a) && isMarkerActive(b)) return -1;
    return (a.tradeNo || 0) - (b.tradeNo || 0);
  });

  return formatMarkersForDisplay(mapped, mode);
}
