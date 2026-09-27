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

export function normalizeNotification(notification, fallbackTime = Date.now()) {
  const eventTime = getNotificationEventTime(notification, fallbackTime);
  const formattedTime = formatUtcPlus7EventTime(eventTime);

  return {
    ...notification,
    event_time: eventTime,
    timestamp: formattedTime || formatUtcPlus7EventTime(fallbackTime),
  };
}
