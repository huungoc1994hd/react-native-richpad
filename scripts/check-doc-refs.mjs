#!/usr/bin/env node
/**
 * Quirk `**Where:**` pointers must name files (and symbols) that exist, and shipped
 * docs must not link to paths left out of the npm tarball.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = name => readFileSync(join(ROOT, name), 'utf8');

const failures = [];

// ---- 1. CONTRIBUTING quirk pointers ----------------------------------------
const contributing = read('CONTRIBUTING.md');
const PATH_RE = /^[\w.+@/-]+\.(ts|tsx|css|mjs|js|md|json|patch|html)$/;

// Only at the start of a line — prose elsewhere mentions the marker itself. The
// block runs to the first blank line, so a pointer wrapped over two lines counts.
for (const block of contributing.matchAll(/^\*\*Where:\*\*([\s\S]*?)\n\s*\n/gm)) {
  const line = contributing.slice(0, block.index).split('\n').length;
  const tokens = [...block[1].matchAll(/`([^`]+)`/g)].map(m => m[1]);
  let lastFile = null;
  for (const token of tokens) {
    if (PATH_RE.test(token)) {
      lastFile = token;
      if (!existsSync(join(ROOT, token))) {
        failures.push(`CONTRIBUTING.md:${line} Where: points at missing ${token}`);
      }
      continue;
    }
    // Not a path: a symbol, valid only against the file named before it.
    if (!lastFile) {
      failures.push(`CONTRIBUTING.md:${line} symbol \`${token}\` with no file before it`);
      continue;
    }
    if (!existsSync(join(ROOT, lastFile))) continue;
    if (!read(lastFile).includes(token.replace(/\(\)$/, ''))) {
      failures.push(`CONTRIBUTING.md:${line} \`${token}\` not found in ${lastFile}`);
    }
  }
}

// ---- 2. Shipped docs reference shipped paths only --------------------------
const pkg = JSON.parse(read('package.json'));
const shippedRoots = pkg.files.filter(entry => !entry.startsWith('!'));
const isShipped = path => shippedRoots.some(root => path === root || path.startsWith(`${root}/`));

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
