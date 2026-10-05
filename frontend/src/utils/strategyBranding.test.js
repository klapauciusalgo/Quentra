import test from 'node:test';
import assert from 'node:assert/strict';
import { STRATEGY_BRANDING } from './strategyBranding.js';

const EXPECTED_NAMES = {
  'pippo-30m-new-gen': 'Novera',
  'pippo-30m-grd': 'Kairon',
  'pippo-30m-short-v2-a': 'Noxara',
  'pippo-30m-short-v2-b': 'Velora',
  'pippo-30m-short-v2-c': 'Sorevia',
  'pippo-30m-alpha': 'Aurelis',
  'pippo-30m-scalp': 'Tessara',
  'pippo-1h-enhanced': 'Elaris',
  'pippo-4h-original': 'Orvane',
  'pure-macro-weekly-ma55': 'Mavora',
};

test('strategy branding covers every catalog strategy', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(STRATEGY_BRANDING).map(([id, value]) => [id, value.name])),
    EXPECTED_NAMES,
  );
});

test('strategy branding keeps readable names, subtitles, and philosophies', () => {
  for (const [id, branding] of Object.entries(STRATEGY_BRANDING)) {
    assert.equal(branding.short_name, branding.name, id);
    assert.ok(branding.philosophy, id);
    assert.ok(branding.subtitle, id);
  }
});
