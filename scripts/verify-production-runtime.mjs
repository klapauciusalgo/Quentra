import assert from 'node:assert/strict';

const baseUrl = (process.env.PRODUCTION_URL || 'https://quentra.klapauciusalgo.workers.dev').replace(/\/$/, '');

async function getJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${pathname} returned non-JSON HTTP ${response.status}`);
  }
  assert.equal(response.ok, true, `${pathname} returned HTTP ${response.status}: ${body.error || body.detail || 'unknown error'}`);
  return body;
}

const [status, liveSignals, strategies] = await Promise.all([
  getJson('/api/status'),
  getJson('/api/signals/live?symbol=BTCUSDT'),
  getJson('/api/strategies?symbol=BTCUSDT'),
]);

assert.equal(status.status, 'ONLINE', `production status is ${status.status}`);
assert.equal(status.signals_available, true, 'production signals_available is not true');
assert.equal(liveSignals.status, 'AUTONOMOUS_ENGINE_LIVE', `live signal status is ${liveSignals.status}`);
assert.equal(Array.isArray(liveSignals.strategies), true, 'live signal strategies is not an array');
assert.equal(liveSignals.strategies.length, 10, `expected 10 live strategies, got ${liveSignals.strategies.length}`);
assert.equal(Array.isArray(strategies), true, 'strategy catalog is not an array');
assert.equal(strategies.length, 10, `expected 10 catalog strategies, got ${strategies.length}`);
assert.equal(strategies.some((strategy) => strategy.name === 'Novera'), true, 'Novera is missing from production catalog');
assert.equal(strategies.some((strategy) => strategy.name === 'Kairon'), true, 'Kairon is missing from production catalog');

console.log(JSON.stringify({
  production: baseUrl,
  status: status.status,
  signals_available: status.signals_available,
  live_signal_status: liveSignals.status,
  live_strategies: liveSignals.strategies.length,
  catalog_strategies: strategies.length,
  branding_sample: strategies.slice(0, 3).map((strategy) => strategy.name),
}));
