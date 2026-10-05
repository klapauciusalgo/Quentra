import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const footerSource = fs.readFileSync(path.join(here, 'Footer.jsx'), 'utf8');
const appSource = fs.readFileSync(path.join(here, '..', 'App.jsx'), 'utf8');
const landingSource = fs.readFileSync(path.join(here, 'LandingPage.jsx'), 'utf8');

test('shared footer uses the Apple utility structure and live platform state', () => {
  assert.match(footerSource, /role="contentinfo"/);
  assert.match(footerSource, /All systems operational/);
  assert.match(footerSource, /Syncing platform systems/);
  assert.match(footerSource, /Discover/);
  assert.match(footerSource, /Research/);
  assert.match(footerSource, /Evidence/);
  assert.match(footerSource, /Open terminal/);
});

test('landing and terminal use the shared footer component', () => {
  assert.match(landingSource, /import Footer from '\.\/Footer';/);
  assert.match(landingSource, /<Footer status=\{status\} onLaunch=\{handleLaunch\} \/>/);
  assert.match(appSource, /import Footer from '\.\/components\/Footer';/);
  assert.match(appSource, /<Footer status=\{status\} \/>/);
});
