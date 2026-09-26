import { formatUtcPlus7EventTime } from './chartTime.js';

export function getNotificationEventTime(notification, fallbackTime = Date.now()) {
  return notification.event_time
    ?? notification.entry_time
    ?? notification.exit_time
    ?? notification.candle_time
    ?? notification.timestamp
    ?? fallbackTime;
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
