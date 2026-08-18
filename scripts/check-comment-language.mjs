#!/usr/bin/env node
/**
 * Source text must be English (CONTRIBUTING, "Comments"). Flags any character outside
 * ASCII plus a typography allow-list, which in practice catches Vietnamese diacritics.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ROOTS = ['src', 'webview', 'scripts'];
const SKIP = new Set(['node_modules', 'dist', 'generated']);
const EXTENSIONS = ['.ts', '.tsx', '.css', '.mjs', '.js', '.html', '.patch'];

/** Config files at the repo root, which no ROOT walk reaches. */
const ROOT_FILES = ['eslint.config.mjs', 'babel.config.js', '.prettierrc.js'];

/** The locale bundle, and the smoke test's accented search fixtures. */
const ALLOWLIST = new Set(['src/locale.ts', 'webview/smoke-test.mjs']);

/** Typography that IS allowed in English source text. */
const ALLOWED_NON_ASCII = new Set([...'—–’‘“”…×→←↑↓↔≠≥≤°⏎✓✔·•│½¼¾²³', ' ']);

const files = [];
const walk = dir => {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (EXTENSIONS.some(ext => entry.endsWith(ext))) files.push(full);
  }
};
for (const dir of ROOTS) walk(join(ROOT, dir));
for (const name of ROOT_FILES) files.push(join(ROOT, name));

const failures = [];
for (const file of files) {
  const name = relative(ROOT, file);
  if (ALLOWLIST.has(name)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, index) => {
    const offenders = [...text].filter(ch => ch.charCodeAt(0) > 127 && !ALLOWED_NON_ASCII.has(ch));
    if (offenders.length > 0) {
      failures.push(
        `${name}:${index + 1} non-English text (${[...new Set(offenders)].join('')}): ${text.trim()}`,
      );
    }
  });
}

if (failures.length > 0) {
  console.error('Source language check FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`Source language check passed (${files.length} files).`);
