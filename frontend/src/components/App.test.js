import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'App.jsx'), 'utf8');
const authSource = fs.readFileSync(path.join(here, '..', 'context', 'AuthContext.jsx'), 'utf8');

test('live refresh callbacks bind requests to the current auth boundary', () => {
  assert.match(source, /const requestAuthBoundary = authBoundaryRef\.current;/);
  assert.doesNotMatch(source, /const requestAuthBoundary = authBoundaryKey;/);
});

test('auth boundary changes purge the previous notification storage owner', () => {
  assert.match(source, /const previousNotificationStorageKey = notificationsOwnerRef\.current;/);
  assert.match(source, /removeItem\(previousNotificationStorageKey\)/);
});

test('authoritative live refresh also reconciles floor and purges notifications after downgrade', () => {
  assert.match(source, /fetch\(`\$\{API_BASE\}\/api\/floor`, \{ headers: authHeaders \}\)/);
  assert.match(source, /if \(!hasProTelemetry\) \{/);
  assert.match(source, /removeItem\(notificationStorageKey\)/);
});

test('simulation failures do not fabricate proprietary execution signals', () => {
  assert.doesNotMatch(source, /Local simulation fallback/);
  assert.doesNotMatch(source, /stop_loss: Math\.round\(ticker\.price \* \(isLong \? 0\.92 : 1\.05\)\)/);
  assert.doesNotMatch(source, /take_profit: Math\.round\(ticker\.price \* \(isLong \? 1\.75 : 0\.88\)\)/);
});

test('session restore refreshes cached Supabase entitlement metadata', () => {
  assert.match(authSource, /supabase\.auth\.refreshSession\(\)/);
  assert.match(authSource, /resolvedSession = refreshedSession/);
  assert.match(authSource, /resolvedSession = currentSession/);
});

test('auth listener is registered before async session restoration', () => {
  const listenerIndex = authSource.indexOf('supabase.auth.onAuthStateChange');
  const getSessionIndex = authSource.indexOf('supabase.auth.getSession');
  assert.ok(listenerIndex >= 0 && getSessionIndex >= 0);
  assert.ok(listenerIndex < getSessionIndex);
});

test('auth listener is unsubscribed on provider unmount', () => {
  assert.match(authSource, /authSubscription\?\.unsubscribe\(\)/);
  assert.match(authSource, /return \(\) => \{[\s\S]*authSubscription\?\.unsubscribe\(\);/);
});
