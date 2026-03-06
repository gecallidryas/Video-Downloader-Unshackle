import fs from 'node:fs';
import path from 'node:path';

const summaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
const badgePath = path.join(process.cwd(), 'docs', 'coverage-badge.svg');

if (!fs.existsSync(summaryPath)) {
  console.error('coverage-badge: run npm run coverage before generating the badge');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const pct = Math.round(summary.total?.lines?.pct ?? 0);
const color = pct >= 90 ? '#2da44e' : pct >= 75 ? '#bf8700' : '#cf222e';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="116" height="20" role="img" aria-label="coverage: ${pct}%"><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="116" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="63" height="20" fill="#555"/><rect x="63" width="53" height="20" fill="${color}"/><rect width="116" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,sans-serif" font-size="11"><text x="31.5" y="15">coverage</text><text x="89.5" y="15">${pct}%</text></g></svg>\n`;

fs.writeFileSync(badgePath, svg);
console.log(`coverage-badge: wrote ${path.relative(process.cwd(), badgePath)}`);
