#!/usr/bin/env node
// Validates every skill in this pack against the Agent Skills spec and the
// house rules in README.md. Zero dependencies: `node scripts/validate-skills.mjs`.

import { readdir, readFile, stat, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = path.join(ROOT, 'skills');
const MAX_CONTAINER_DEPTH = 3; // skills/<cat>/<cat>/<name>/SKILL.md
const MAX_DESCRIPTION = 1024;
const MAX_SKILL_LINES = 500;
const MAX_FILE_BYTES = 512 * 1024;
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const errors = [];
const warnings = [];
const fail = (skill, message) => errors.push({ skill, message });
const warn = (skill, message) => warnings.push({ skill, message });

/** Minimal YAML subset: scalars, quoted strings, block scalars, nested maps, `- ` lists. */
function parseFrontmatter(raw) {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return { error: 'missing opening --- delimiter' };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end === -1) return { error: 'missing closing --- delimiter' };

  const body = lines.slice(1, end);
  const data = {};
  let i = 0;

  const indentedBlock = (baseIndent) => {
    const block = [];
    while (i < body.length) {
      const line = body[i];
      if (line.trim() === '') {
        block.push('');
        i += 1;
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent <= baseIndent) break;
      block.push(line.slice(Math.min(indent, baseIndent + 2)));
      i += 1;
    }
    return block;
  };

  while (i < body.length) {
    const line = body[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      i += 1;
      continue;
    }
    const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) {
      i += 1;
      continue;
    }
    const [, key, rawValue] = match;
    const indent = line.length - line.trimStart().length;

    if (rawValue === '' || /^[|>][+-]?$/.test(rawValue)) {
      i += 1;
      const block = indentedBlock(indent);
      if (rawValue === '' && block.some((entry) => /^[A-Za-z0-9_.-]+:/.test(entry))) {
        const nested = {};
        for (const entry of block) {
          const child = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(entry);
          if (!child) continue;
          let value = child[2].trim().replace(/^["']|["']$/g, '');
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          nested[child[1]] = value;
        }
        data[key] = nested;
      } else if (block.some((entry) => entry.startsWith('- '))) {
        data[key] = block
          .filter((entry) => entry.startsWith('- '))
          .map((entry) => entry.slice(2).trim().replace(/^["']|["']$/g, ''));
      } else if (rawValue.startsWith('|')) {
        data[key] = block.join('\n');
      } else if (rawValue.startsWith('>')) {
        data[key] = block.join(' ').replace(/\s+/g, ' ').trim();
      } else {
        data[key] = block.join('\n').trim();
      }
      continue;
    }

    let value = rawValue.trim();
    if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    data[key] = value;
    i += 1;
  }

  return { data, body: lines.slice(end + 1).join('\n') };
}

async function findSkills(dir, depth = 1) {
  if (depth > MAX_CONTAINER_DEPTH + 1) return [];
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await findSkills(full, depth + 1)));
    else if (entry.name === 'SKILL.md') found.push(dir);
  }
  return found;
}

async function walkFiles(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        fail(path.basename(dir), `unexpected ${entry.name}/ inside a skill folder`);
        continue;
      }
      await walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const stripCode = (markdown) => markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

async function checkLinks(skillDir, name, body) {
  const links = [...stripCode(body).matchAll(/!?\[[^\]]*]\(([^)\s]+)\)/g)].map((m) => m[1]);
  for (const link of new Set(links)) {
    if (/^(https?:|mailto:|#|tel:|data:)/.test(link)) continue;
    const target = decodeURI(link.split('#')[0].split('?')[0]);
    if (!target) continue;
    if (!existsSync(path.resolve(skillDir, target))) fail(name, `broken link: ${link}`);
  }
}

const skillDirs = (await findSkills(SKILLS_DIR)).sort();
if (skillDirs.length === 0) {
  console.error('No SKILL.md found under skills/');
  process.exit(1);
}

const seen = new Map();

for (const dir of skillDirs) {
  const relative = path.relative(ROOT, dir).split(path.sep).join('/');
  const folder = path.basename(dir);
  const raw = await readFile(path.join(dir, 'SKILL.md'), 'utf8');
  const { error, data = {}, body = '' } = parseFrontmatter(raw);

  if (error) {
    fail(folder, `${relative}/SKILL.md: ${error}`);
    continue;
  }

  const name = typeof data.name === 'string' ? data.name : '';
  if (!name) fail(folder, 'frontmatter is missing `name`');
  else if (!NAME_RE.test(name)) fail(folder, `name "${name}" must be lowercase kebab-case`);
  else if (name !== folder) fail(folder, `name "${name}" does not match folder "${folder}"`);

  if (seen.has(name)) fail(folder, `duplicate skill name "${name}" (also ${seen.get(name)})`);
  else seen.set(name, relative);

  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!description) fail(folder, 'frontmatter is missing `description`');
  else if (description.length > MAX_DESCRIPTION)
    fail(folder, `description is ${description.length} chars, over the ${MAX_DESCRIPTION} budget`);
  else if (description.length < 30) warn(folder, 'description is very short — the agent has little to trigger on');

  if (!/^#\s+\S/m.test(body)) fail(folder, 'body has no `# ` heading');
  const lines = raw.split(/\r?\n/).length;
  if (lines > MAX_SKILL_LINES)
    warn(folder, `SKILL.md is ${lines} lines — consider moving detail into references/`);

  await checkLinks(dir, folder, body);

  for (const file of await walkFiles(dir)) {
    const info = await stat(file);
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (info.size > MAX_FILE_BYTES)
      warn(folder, `${rel} is ${(info.size / 1024).toFixed(0)} KiB — large for a skill payload`);
    if ((await lstat(file)).isSymbolicLink()) warn(folder, `${rel} is a symlink; the installer follows it`);
  }
}

const label = (count) => `${count} ${count === 1 ? 'skill' : 'skills'}`;
console.log(`Validating ${label(skillDirs.length)} under skills/\n`);
for (const { skill, message } of errors) console.log(`  ✗ ${skill}: ${message}`);
for (const { skill, message } of warnings) console.log(`  ! ${skill}: ${message}`);
if (errors.length + warnings.length === 0) console.log('  ✓ all skills clean');

console.log(`\n${errors.length} error(s), ${warnings.length} warning(s) across ${label(skillDirs.length)}`);
process.exit(errors.length > 0 ? 1 : 0);
