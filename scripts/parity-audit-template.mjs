import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const gapDocPath = resolve(repoRoot, 'docs/gap-partial-items.md');

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function parseRows(markdown) {
  const rows = [];
  let priority = '';

  for (const line of markdown.split(/\r?\n/)) {
    const priorityMatch = /^## (P\d)\b/.exec(line);
    if (priorityMatch) {
      priority = priorityMatch[1];
      continue;
    }

    const rowMatch = /^\| (.+) \|$/.exec(line);
    if (!rowMatch || rowMatch[1].startsWith('# |')) {
      continue;
    }

    const cells = rowMatch[1].split(' | ');
    const id = Number(cells[0]);
    if (!Number.isInteger(id)) {
      continue;
    }

    rows.push({
      id,
      priority,
      item: cells[1] ?? '',
      sourceStatus: cells[2] ?? '',
    });
  }

  return rows;
}

function renderChecklist(rows) {
  const lines = [
    '# Parity Audit Checklist',
    '',
    'Generated from `docs/gap-partial-items.md`. Fill implementation evidence during the full P0-P3 re-audit.',
    '',
    '| # | Priority | Item | Source status | Implementation | Runtime wiring | UI exposure | Tests | Docs | Verdict | Notes |',
    '|---:|---|---|---|---|---|---|---|---|---|---|',
  ];

  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.priority,
        escapeCell(row.item),
        escapeCell(row.sourceStatus),
        '',
        '',
        '',
        '',
        '',
        'unverified',
        '',
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'),
    );
  }

  return `${lines.join('\n')}\n`;
}

const markdown = readFileSync(gapDocPath, 'utf8');
const rows = parseRows(markdown);

const ids = rows.map((row) => row.id);
const expectedIds = Array.from({ length: 150 }, (_, index) => index + 1);
if (ids.length !== expectedIds.length || ids.some((id, index) => id !== expectedIds[index])) {
  throw new Error('Expected docs/gap-partial-items.md to contain consecutive rows #1-150.');
}

process.stdout.write(renderChecklist(rows));
