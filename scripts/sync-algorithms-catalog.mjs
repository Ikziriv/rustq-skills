#!/usr/bin/env node
// Regenerates skills/rust-algorithms/references/catalog.md from the upstream
// TheAlgorithms/Rust DIRECTORY.md. Run manually after upstream changes:
//   node scripts/sync-algorithms-catalog.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'skills', 'rust-algorithms', 'references', 'catalog.md');
const SOURCE =
  'https://raw.githubusercontent.com/TheAlgorithms/Rust/master/DIRECTORY.md';
const REPO = 'https://github.com/TheAlgorithms/Rust';

// Upstream DIRECTORY.md occasionally lags the tree. Map stale paths to the real file
// so the catalog never links a 404.
const ALIASES = new Map([
  ['src/greedy/minimum_coin_changes.rs', 'src/greedy/minimum_coin_change.rs'],
]);

const response = await fetch(SOURCE, {
  headers: { 'user-agent': 'rustq-skills-catalog-sync' },
});
if (!response.ok) {
  console.error(`Failed to fetch ${SOURCE}: ${response.status} ${response.statusText}`);
  process.exit(1);
}
const markdown = await response.text();

/** @type {{ name: string, url: string }[][]} */
let categories = [];
let current = null;
let subcategory = null;

for (const line of markdown.split(/\r?\n/)) {
  const top = /^ {2}\* (.+)$/.exec(line);
  if (top) {
    const name = top[1].trim();
    current = [];
    categories.push({ name, entries: current });
    subcategory = null;
    continue;
  }
  if (!current) continue;

  const sub = /^ {4}\* (.+)$/.exec(line);
  if (sub && !sub[1].includes('](')) {
    subcategory = sub[1].trim();
    current.push({ subcategory });
    continue;
  }

  const entry = /^\s*\* \[([^\]]+)]\(([^)]+)\)/.exec(line);
  if (entry) current.push({ name: entry[1], url: entry[2], subcategory });
}

const total = categories.reduce(
  (sum, category) => sum + category.entries.filter((entry) => entry.url).length,
  0,
);
if (total === 0) {
  console.error('Parsed zero entries — upstream layout probably changed.');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const lines = [
  '# Algorithm catalog',
  '',
  `Every algorithm in [TheAlgorithms/Rust](${REPO}) — ${total} entries across`,
  `${categories.length} categories. Generated from its \`DIRECTORY.md\` on ${today}.`,
  '',
  'Links point at the upstream source (MIT). This file is an index: read the algorithm here, then',
  'write the version your problem needs. The vendored copies live in the `rust-algorithms-upstream`',
  'skill under `src/<category>/`. Regenerate with `node scripts/sync-algorithms-catalog.mjs`.',
  '',
];

for (const category of categories) {
  const count = category.entries.filter((entry) => entry.url).length;
  lines.push(`## ${category.name} (${count})`, '');
  let openSub = null;
  for (const entry of category.entries) {
    if (!entry.url) {
      openSub = entry.subcategory;
      lines.push(`### ${entry.subcategory}`, '');
      continue;
    }
    if (entry.subcategory && entry.subcategory !== openSub) {
      openSub = entry.subcategory;
      lines.push(`### ${entry.subcategory}`, '');
    }
    const raw = entry.url.split('/blob/master/')[1];
    const rel = raw ? (ALIASES.get(raw) ?? raw) : null;
    const url = rel ? `${REPO}/blob/master/${rel}` : entry.url;
    lines.push(`- [${entry.name}](${url})`);
  }
  lines.push('');
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, lines.join('\n'), 'utf8');
console.log(
  `Wrote ${path.relative(ROOT, OUT)} — ${total} algorithms in ${categories.length} categories.`,
);
