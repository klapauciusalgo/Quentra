import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = path.dirname(fileURLToPath(import.meta.url));
const catalogFiles = ['../data/strategiesData.json', '../data/strategiesData_eth.json'];
const restrictedKeys = new Set([
  'logic_summary',
  'recommended_for',
  'parameters',
  'active_ticket',
  'stop_loss',
  'take_profit',
  'breakeven_trigger',
  'breakeven_trigger_pct',
]);
const restrictedTextFragments = [
  'force close ma',
  'force_close_ma',
  'fast_breakeven',
  'be locked @',
  'structure_exit',
  'bearish choch',
  'weekly close < ma55',
  'active long @',
  'active short @',
];

function assertPublicOnly(value, relativeFile, location = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicOnly(item, relativeFile, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    assert.equal(restrictedKeys.has(key), false, `${relativeFile} leaked ${location}.${key}`);
    if (typeof nested === 'string') {
      const lower = nested.toLowerCase();
      for (const fragment of restrictedTextFragments) {
        assert.equal(lower.includes(fragment), false, `${relativeFile} leaked ${location}.${key}: ${fragment}`);
      }
    }
    if (key === 'eventType') {
      assert.notEqual(String(nested).toLowerCase(), 'breakeven', `${relativeFile} leaked breakeven marker`);
    }
    assertPublicOnly(nested, relativeFile, `${location}.${key}`);
  }
  assert.equal(value.isActive, undefined, `${relativeFile} leaked active marker`);
  assert.equal(value.isBreakeven, undefined, `${relativeFile} leaked breakeven marker`);
  assert.equal(value.is_active, undefined, `${relativeFile} leaked active trade state`);
  assert.equal(value.partial_exit_price, undefined, `${relativeFile} leaked partial exit level`);
  assert.equal(value.partial_position_pct, undefined, `${relativeFile} leaked partial position state`);
  assert.notEqual(String(value.status || '').toUpperCase(), 'OPEN', `${relativeFile} leaked open trade state`);
  assert.notEqual(String(value.status || '').toUpperCase(), 'RUNNING', `${relativeFile} leaked running state`);
  assert.notEqual(String(value.exit_time || '').toUpperCase(), 'RUNNING', `${relativeFile} leaked running exit state`);
}

for (const relativeFile of catalogFiles) {
  test(`${relativeFile} contains public catalog data only`, () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, relativeFile), 'utf8'));
    assert.ok(Array.isArray(catalog));
    assert.ok(catalog.length > 0);

    for (const strategy of catalog) {
      assertPublicOnly(strategy, relativeFile, `strategy:${strategy.id}`);
      assert.equal(typeof strategy.public_summary, 'string');
      assert.equal(typeof strategy.public_audience, 'string');
    }
  });
}
