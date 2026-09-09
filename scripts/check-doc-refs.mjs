#!/usr/bin/env node
/**
 * Shipped docs (README, CHANGELOG) must not link to repository paths that the npm
 * tarball leaves out.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = name => readFileSync(join(ROOT, name), 'utf8');
const PATH_RE = /^[\w.+@/-]+\.(ts|tsx|css|mjs|js|md|json|patch|html)$/;

const pkg = JSON.parse(read('package.json'));
const shippedRoots = pkg.files.filter(entry => !entry.startsWith('!'));
const isShipped = path => shippedRoots.some(root => path === root || path.startsWith(`${root}/`));

const failures = [];
for (const doc of ['README.md', 'CHANGELOG.md']) {
  const source = read(doc);
  for (const match of source.matchAll(/`([^`]+)`/g)) {
    const token = match[1];
    if (!PATH_RE.test(token) || !token.includes('/')) continue;
    if (!existsSync(join(ROOT, token))) continue; // prose, not a repo path
    if (!isShipped(token)) {
      const line = source.slice(0, match.index).split('\n').length;
      failures.push(
        `${doc}:${line} references ${token}, which package.json "files" leaves out — link the repository instead`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('Doc reference check FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('Doc reference check passed.');
