const UTC_PLUS_7 = 'Asia/Jakarta';
const UTC_PLUS_7_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: UTC_PLUS_7,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function toDate(time) {
  if (typeof time === 'number' && Number.isFinite(time)) {
    return new Date((time > 1e12 ? time : time * 1000));
  }

  if (time && typeof time === 'object' && 'year' in time && 'month' in time && 'day' in time) {
    return new Date(Date.UTC(time.year, time.month - 1, time.day));
  }

  if (typeof time !== 'string' || !time.trim()) return null;
  const text = time.trim();
  const normalized = text.endsWith(' UTC')
    ? `${text.slice(0, -4).trim()}Z`
    : /(?:Z|[+-]\d{2}:?\d{2})$/.test(text)
      ? text
      : `${text.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getParts(time) {
  const date = toDate(time);
  if (!date) return null;

  return Object.fromEntries(
    UTC_PLUS_7_FORMATTER
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]),
  );
}

export function formatUtcPlus7Time(time) {
  const parts = getParts(time);
  if (!parts) return '';
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

export function formatUtcPlus7EventTime(time) {
  const parts = getParts(time);
  if (!parts) return '';
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatUtcPlus7Tick(time, tickMarkType) {
  const parts = getParts(time);
  if (!parts) return '';

  // Lightweight Charts TickMarkType: Year=0, Month=1, DayOfMonth=2,
  // Time=3, TimeWithSeconds=4.
  if (tickMarkType === 0) return parts.year;
  if (tickMarkType === 1) return `${parts.month} ${parts.year.slice(-2)}`;
  if (tickMarkType === 2) return `${parts.day} ${parts.month}`;
  if (tickMarkType === 4) return `${parts.hour}:${parts.minute}:${parts.second}`;
  return `${parts.hour}:${parts.minute}`;
}
