import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const snapshot = mkdtempSync(join(tmpdir(), 'quentra-dist-'));
const snapshotDist = join(snapshot, 'dist');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runBuild() {
  const result = spawnSync(npmCommand, ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`npm run build failed with status ${result.status}`);
  }
}

function filesUnder(directory, base = directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...filesUnder(absolute, base));
    } else if (entry.isFile()) {
      files.push(relative(base, absolute));
    }
  }
  return files.sort();
}

function digest(directory, file) {
  const bytes = readFileSync(join(directory, file));
  return `${bytes.length}:${createHash('sha256').update(bytes).digest('hex')}`;
}

try {
  runBuild();
  cpSync(dist, snapshotDist, { recursive: true });
  runBuild();

  const first = filesUnder(snapshotDist);
  const second = filesUnder(dist);
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error('dist file list changed between identical builds');
  }

  const differences = first.filter((file) => digest(snapshotDist, file) !== digest(dist, file));
  if (differences.length > 0) {
    throw new Error(`dist is not reproducible: ${differences.join(', ')}`);
  }

  console.log(`Reproducible build verified: ${first.length} files are byte-identical.`);
} finally {
  rmSync(snapshot, { recursive: true, force: true });
}
