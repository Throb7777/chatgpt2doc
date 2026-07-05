import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const artifactDir = path.resolve('docs/qa-artifacts/m14-5');
const report = JSON.parse(await readFile(path.join(artifactDir, 'm14-5-report.json'), 'utf8'));
const acceptance = JSON.parse(await readFile(
  path.join(artifactDir, 'm14-5-visual-acceptance.json'),
  'utf8',
));

assert(Array.isArray(report.reports), 'M14.5 PDF report is missing reports.');
assert(report.reports.length === 2, 'M14.5 PDF report must contain A4 and Letter.');

for (const paper of ['a4', 'letter']) {
  const entry = report.reports.find((value) => value.paper === paper);
  assert(entry, `M14.5 PDF report is missing ${paper}.`);
  assert(entry.pages === 1, `${paper} PDF must render on exactly one page.`);
  assert(entry.invalidTextCharacters === 0, `${paper} PDF has invalid text characters.`);
  assert(entry.warningCodes.length === 0, `${paper} PDF has renderer warnings.`);
  assert(entry.fontResources.every((count) => count <= 16), `${paper} PDF has too many font resources.`);
  assert(entry.textItems.every((count) => count <= 260), `${paper} PDF has excessive text fragmentation.`);
  assert(entry.baseFonts.some((font) => font.includes('NotoSerif')), `${paper} PDF is missing embedded Noto Serif.`);
  assert(entry.baseFonts.some((font) => font.includes('CascadiaMono')), `${paper} PDF is missing embedded Cascadia Mono.`);
  assert(entry.baseFonts.some((font) => font.includes('NotoSansSC')), `${paper} PDF is missing embedded Noto Sans SC.`);
  assert(entry.baseFonts.some((font) => font.includes('NotoSansMath')), `${paper} PDF is missing embedded Noto Sans Math.`);
  assert(entry.baseFonts.every((font) => !/Times|Courier|Symbol|ArialUnicode/u.test(font)),
    `${paper} PDF still contains a system fallback font.`);
}

assert(acceptance.status === 'PASS', 'M14.5 visual acceptance is not PASS.');
assert(acceptance.poppler.missingFontWarnings === 0, 'Poppler reported missing-font warnings.');
assert(acceptance.visualReview.a4 === 'PASS', 'A4 visual review did not pass.');
assert(acceptance.visualReview.letter === 'PASS', 'Letter visual review did not pass.');
assert(acceptance.visualReview.findings.length === 0, 'Visual review has open findings.');

for (const file of acceptance.renderedPages) {
  const bytes = await readFile(path.join(artifactDir, file));
  const info = await stat(path.join(artifactDir, file));
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]));
  assert(isPng && info.size > 50_000, `Rendered page ${file} is not a valid reviewed PNG.`);
}

console.log(JSON.stringify({
  checks: 17,
  renderedPages: acceptance.renderedPages.length,
  papers: report.reports.map(({ paper, pages, size }) => ({ pages, paper, size })),
  status: 'PASS',
}, null, 2));
