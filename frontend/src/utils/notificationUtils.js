import { formatUtcPlus7EventTime, toUtcDate } from './chartTime.js';

export function getNotificationEventTime(notification, fallbackTime = Date.now()) {
  return notification.event_time
    ?? notification.entry_time
    ?? notification.exit_time
    ?? notification.candle_time
    ?? notification.timestamp
    ?? fallbackTime;
}

export function sortNotificationsNewestFirst(notifications) {
  return (Array.isArray(notifications) ? notifications : [])
    .map((notification, index) => ({
      notification,
      index,
      timestamp: toUtcDate(getNotificationEventTime(notification, 0))?.getTime() || 0,
    }))
    .sort((left, right) => right.timestamp - left.timestamp || left.index - right.index)
    .map(({ notification }) => notification);
}

export function getClosedTradeEventKey(asset, strategyId, trade) {
  return [
    'SIGNAL_EXIT',
    asset || 'BTCUSDT',
    strategyId || trade?.strategy_id || '',
    trade?.trade_no ?? '',
    trade?.exit_time ?? '',
    trade?.exit_price ?? '',
  ].join(':');
}

function compareClosedTrades(left, right) {
  if (!left) return right;
  if (!right) return left;
  const leftNo = Number(left.trade_no);
  const rightNo = Number(right.trade_no);
  if (Number.isFinite(leftNo) && Number.isFinite(rightNo) && leftNo !== rightNo) {
    return rightNo > leftNo ? right : left;
  }
  const leftTime = toUtcDate(left.exit_time)?.getTime() || 0;
  const rightTime = toUtcDate(right.exit_time)?.getTime() || 0;
  return rightTime >= leftTime ? right : left;
}

export function getLatestClosedTrade(strategy) {
  let latest = strategy?.last_closed_trade || null;
  for (const trade of Array.isArray(strategy?.trades) ? strategy.trades : []) {
    if (['CLOSED', 'EXITED', 'FLAT'].includes(String(trade?.status || '').toUpperCase())) {
      latest = compareClosedTrades(latest, trade);
    }
  }
  return latest;
}

export function buildHistoricalTradeNotifications(asset, strategy) {
  const trade = getLatestClosedTrade(strategy);
  const strategyId = strategy?.strategy_id || strategy?.id;
  if (!strategyId || !trade) return [];

  const direction = String(trade.side || trade.type || strategy.direction || 'LONG').toUpperCase();
  const action = direction === 'SHORT' ? 'SELL' : 'BUY';
  const events = [];
  if (trade.entry_time && trade.entry_price !== undefined && trade.entry_price !== null) {
    events.push({
      type: 'NEW_SIGNAL',
      title: `${action} ENTRY: ${strategy.name || strategyId}`,
      strategy: strategy.name || strategyId,
      strategy_id: strategyId,
      direction,
      price: trade.entry_price,
      entry_time: trade.entry_time,
      event_time: trade.entry_time,
      event_key: `NEW_SIGNAL:${asset || 'BTCUSDT'}:${strategyId}:${trade.trade_no ?? trade.entry_time ?? trade.entry_price}`,
      historical: true,
      action,
    });
  }
  if (trade.exit_time && trade.exit_price !== undefined && trade.exit_price !== null) {
    events.push({
      type: 'SIGNAL_EXIT',
      title: `POSITION CLOSED: ${strategy.name || strategyId}`,
      strategy: strategy.name || strategyId,
      strategy_id: strategyId,
      reason: trade.reason || trade.exit_reason || 'Market Exit',
      pnl: trade.net_return_pct !== undefined
        ? `${trade.net_return_pct > 0 ? '+' : ''}${trade.net_return_pct}%`
        : '',
      price: trade.exit_price,
      exit_time: trade.exit_time,
      event_time: trade.exit_time,
      event_key: getClosedTradeEventKey(asset, strategyId, trade),
      historical: true,
      trade,
    });
  }
  return events;
}

export function reconcileClosedTrades(asset, strategies, seenKeys, seenTradeNumbers) {
  const events = [];
  for (const strategy of Array.isArray(strategies) ? strategies : []) {
    const strategyId = strategy?.strategy_id;
    const closed = strategy?.last_closed_trade;
    if (!strategyId || !closed) continue;

    const stateKey = `${asset || 'BTCUSDT'}:${strategyId}`;
    const eventKey = getClosedTradeEventKey(asset, strategyId, closed);
    const previousKey = seenKeys.get(stateKey);
    const tradeNo = closed.trade_no !== undefined && closed.trade_no !== null
      ? String(closed.trade_no)
      : '';
    const previousTradeNo = seenTradeNumbers?.get(stateKey);
    const sameTrade = tradeNo && previousTradeNo === tradeNo;
    if ((previousKey || previousTradeNo) && previousKey !== eventKey && !sameTrade) {
      events.push({
        strategy_id: strategyId,
        strategy_name: strategy.name || '',
        trade: closed,
        event_key: eventKey,
      });
    }
    seenKeys.set(stateKey, eventKey);
    if (seenTradeNumbers && tradeNo) seenTradeNumbers.set(stateKey, tradeNo);
  }
  return events;
}

export function normalizeNotification(notification, fallbackTime = Date.now()) {
  const eventTime = getNotificationEventTime(notification, fallbackTime);
  const formattedTime = formatUtcPlus7EventTime(eventTime);

  return {
    ...notification,
    event_time: eventTime,
    timestamp: formattedTime || formatUtcPlus7EventTime(fallbackTime),
  };
}
