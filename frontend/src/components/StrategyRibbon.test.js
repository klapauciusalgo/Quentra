import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'StrategyRibbon.jsx'), 'utf8');
const floorSource = fs.readFileSync(path.join(here, 'PixelTradingFloor.jsx'), 'utf8');

test('redacted regime telemetry never falls back to exact MA55 values', () => {
  assert.doesNotMatch(source, /const defaultMa55 = isEth \? 2648\.68 : 82654/);
  assert.match(source, /PROTECTED/);
  assert.match(source, /hasRegimeTelemetry/);
  assert.doesNotMatch(floorSource, /weekly_ma55 \|\| 82654/);
  assert.doesNotMatch(floorSource, /distance_pct \|\| -6\.5/);
});
