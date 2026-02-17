import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = resolve(__dirname, '..', '..', '..');
const gapDocPath = resolve(repoRoot, 'docs/gap-partial-items.md');
const scriptPath = resolve(repoRoot, 'scripts/parity-audit-template.mjs');

function extractSourceItems(): Array<{ id: number; priority: string }> {
  const gapDoc = readFileSync(gapDocPath, 'utf8');
  const items: Array<{ id: number; priority: string }> = [];
  let priority = '';

  for (const line of gapDoc.split(/\r?\n/)) {
    const priorityMatch = /^## (P\d)\b/.exec(line);
    if (priorityMatch) {
      priority = priorityMatch[1];
      continue;
    }

    const rowMatch = /^\| (\d+) \|/.exec(line);
    if (rowMatch) {
      items.push({ id: Number(rowMatch[1]), priority });
    }
  }

  return items;
}

describe('parity audit checklist template', () => {
  test('generates deterministic audit rows for every numbered parity item', () => {
    const output = execFileSync('node', [scriptPath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    expect(output).toContain(
      '| # | Priority | Item | Source status | Implementation | Runtime wiring | UI exposure | Tests | Docs | Verdict | Notes |',
    );

    const sourceItems = extractSourceItems();
    expect(sourceItems.map((item) => item.id)).toEqual(
      Array.from({ length: 150 }, (_, index) => index + 1),
    );

    for (const sourceItem of sourceItems) {
      expect(output).toContain(`| ${sourceItem.id} | ${sourceItem.priority} |`);
    }

    expect(output).toContain('| 54 | P1 |');
    expect(output).toContain('| 140 | P3 |');
    expect(output).toContain('| 150 | P3 |');
  });
});
