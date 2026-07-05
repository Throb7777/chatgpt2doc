import { readFile } from 'node:fs/promises';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const artifactDir = path.resolve('docs/qa-artifacts/m13-6');
const report = JSON.parse(await readFile(path.join(artifactDir, 'm13-6-report.json'), 'utf8'));
const acceptance = JSON.parse(await readFile(
  path.join(artifactDir, 'm13-6-visual-acceptance.json'),
  'utf8',
));

assert(Array.isArray(report.reports), 'M13.6 PDF report is missing reports.');
assert(report.reports.length === 2, 'M13.6 PDF report must contain A4 and Letter.');

for (const paper of ['a4', 'letter']) {
  const entry = report.reports.find((value) => value.paper === paper);
  assert(entry, `M13.6 PDF report is missing ${paper}.`);
  assert(entry.pages === 1, `${paper} PDF must render on exactly one page.`);
  assert(entry.invalidTextCharacters === 0, `${paper} PDF has invalid text characters.`);
  assert(entry.warningCodes.length === 0, `${paper} PDF has renderer warnings.`);
  assert(entry.fontResources.every((count) => count <= 16), `${paper} PDF has too many font resources.`);
  assert(entry.textItems.every((count) => count <= 260), `${paper} PDF has excessive text fragmentation.`);
  assert(entry.baseFonts.some((font) => font.includes('NotoSerif')), `${paper} PDF is missing embedded Noto Serif.`);
  assert(entry.baseFonts.some((font) => font.includes('NotoSansMono')), `${paper} PDF is missing embedded Noto Sans Mono.`);
  assert(entry.baseFonts.every((font) => !/Times|Courier|Symbol|ArialUnicode/u.test(font)),
    `${paper} PDF still contains a system fallback font.`);
}

assert(acceptance.status === 'PASS', 'M13.6 visual acceptance is not PASS.');
assert(acceptance.poppler.missingFontWarnings === 0, 'Poppler reported missing-font warnings.');
assert(acceptance.visualReview.a4 === 'PASS', 'A4 visual review did not pass.');
assert(acceptance.visualReview.letter === 'PASS', 'Letter visual review did not pass.');
assert(acceptance.visualReview.findings.length === 0, 'Visual review has open findings.');

console.log(JSON.stringify({
  checks: 16,
  papers: report.reports.map(({ paper, pages, size }) => ({ pages, paper, size })),
  status: 'PASS',
}, null, 2));
