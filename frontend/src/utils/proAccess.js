import { stripLiveState } from './catalogUtils.js';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Display-only hint derived from the server-mapped auth profile.
 * Authorization remains backend-owned and is never decided by this helper.
 */
export function hasProAccess(user, now = Date.now()) {
  if (!user || typeof user !== 'object') return false;
  if (normalized(user.plan) !== 'pro') return false;
  if (!ACTIVE_STATUSES.has(normalized(user.subscription_status))) return false;

  const expiresAt = user.pro_expires_at;
  if (expiresAt !== undefined && expiresAt !== null && expiresAt !== '') {
    const expiry = parseTimestamp(expiresAt);
    if (expiry === null || expiry <= now) return false;
  }
  return true;
}

export function stripProContent(strategy) {
  if (!strategy || typeof strategy !== 'object') return strategy;
  const publicStrategy = stripLiveState([strategy])[0] || strategy;
  const restrictedKeys = new Set([
    'logic_summary',
    'recommended_for',
    'parameters',
    'active_ticket',
    'stop_loss',
    'take_profit',
    'breakeven_trigger',
    'breakeven_trigger_pct',
    'partial_exit_price',
    'partial_position_pct',
    'partial_taken',
    'partial_harvested',
    'be_activated',
    'is_active',
    'isActive',
  ]);

  const redact = (value) => {
    if (Array.isArray(value)) {
      return value
        .filter((item) => {
          if (!item || typeof item !== 'object') return true;
          const status = String(item.status || '').toUpperCase();
          const eventType = String(item.eventType || item.event_type || '').toLowerCase();
          const text = String(item.text || '').toLowerCase();
          return status !== 'OPEN'
            && status !== 'RUNNING'
            && eventType !== 'breakeven'
            && eventType !== 'stop_loss'
            && eventType !== 'take_profit'
            && !item.isActive
            && !item.isBreakeven
            && !text.includes('breakeven')
            && !text.includes('be locked')
            && !text.startsWith('active ');
        })
        .map(redact);
    }
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !restrictedKeys.has(key))
        .map(([key, nested]) => [key, redact(nested)])
    );
  };

  return {
    ...redact(publicStrategy),
    logic_summary: null,
    recommended_for: null,
    parameters: {},
    active_ticket: null,
    has_active_signal: false,
  };
}
