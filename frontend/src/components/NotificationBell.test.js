import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'NotificationBell.jsx');
const source = fs.readFileSync(sourcePath, 'utf8');

test('renders recent signal events before active executions', () => {
  assert.match(source, /max-h-\[70vh\] overflow-y-auto flex flex-col/);
  assert.match(source, /className="order-1 pt-2 border-t/);
  assert.match(source, /className="order-2"/);
});
