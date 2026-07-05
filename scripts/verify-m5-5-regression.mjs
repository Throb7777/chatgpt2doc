import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const checks = [];

function check(name, condition, details) {
  checks.push({ details, name, passed: Boolean(condition) });
}

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function text(relativePath, encoding = 'utf8') {
  return readFile(path.join(root, relativePath), encoding);
}

async function sha256(relativePath) {
  return createHash('sha256')
    .update(await readFile(path.join(root, relativePath)))
    .digest('hex');
}

const foundation = await json('docs/qa-artifacts/m5-1/inspection.json');
const structured = await json('docs/qa-artifacts/m5-2/inspection.json');
const math = await json('docs/qa-artifacts/m5-3/inspection.json');
const pagination = await json('docs/qa-artifacts/m5-4/inspection.json');
const baselines = await json('docs/qa-artifacts/m5-5/screenshot-baselines.json');
const structuredRaw = await text(
  'docs/qa-artifacts/m5-2/m5-2-structured-content.pdf',
  'latin1',
);
const structuredText = structured.extractedPages.join('\n');
const mathText = math.extractedPages.join('\n');
const paginationText = pagination.pages.map(({ text: value }) => value).join('\n');

check('foundation-samples', foundation.length === 2, { count: foundation.length });
check('foundation-a4-geometry', foundation.some(({ height, width }) =>
  width === 595.28 && height === 841.89), foundation);
check('foundation-letter-geometry', foundation.some(({ height, width }) =>
  width === 612 && height === 792), foundation);
check('foundation-bilingual-text', foundation.every(({ extractedText }) =>
  extractedText.includes('Searchable English text')
    && extractedText.includes('可搜索的中文文本')), foundation.map(({ fileName }) => fileName));

check('structured-pages', structured.pageCount === 3, { pageCount: structured.pageCount });
check('structured-image-object', structured.hasImageObject === true, structured.hasImageObject);
check('structured-link-annotation', structured.hasLinkAnnotation === true
  && structured.links.includes('https://example.com/'), structured.links);
check('structured-no-warnings', structured.warnings.length === 0, structured.warnings);
for (const expected of [
  'Reference Export Fixture',
  '这是一段简体中文',
  'function identity',
  'Synthetic three-bar chart',
  'Example Domain',
  'P12:',
]) {
  check(`structured-text-${expected}`, structuredText.includes(expected), expected);
}
check('structured-raw-image', structuredRaw.includes('/Subtype /Image'), '/Subtype /Image');
check('structured-raw-link', structuredRaw.includes('/Subtype /Link'), '/Subtype /Link');
check('structured-unicode-map', structuredRaw.includes('/ToUnicode'), '/ToUnicode');
check('structured-embedded-font', structuredRaw.includes('/FontFile2'), '/FontFile2');

check('math-pages', math.pageCount === 2, { pageCount: math.pageCount });
check('math-single-fallback', math.fallbackWarnings.length === 1, math.fallbackWarnings);
check('math-fallback-provenance', math.fallbackWarnings[0]?.provenance?.messageId
  === 'assistant-math' && math.fallbackWarnings[0]?.provenance?.nodePath?.[0] === 19,
math.fallbackWarnings[0]);
for (const expected of ['∑', '∫', 'α', 'β', '≤', '∞', 'Unsupported color expression: x']) {
  check(`math-text-${expected}`, mathText.includes(expected), expected);
}

check('pagination-pages', pagination.pageCount === 7, {
  pageCount: pagination.pageCount,
});
check('pagination-no-warnings', pagination.warnings.length === 0, pagination.warnings);
check('pagination-text-bounds', pagination.pages.every(({ height, yMax, yMin }) =>
  yMin >= 45 && yMax <= height - 45), pagination.pages.map(({ yMax, yMin }) => ({ yMax, yMin })));
for (const expected of [
  'KEEP_WITH_HEADING_SENTINEL',
  'const line90 = 90;',
  'cell-260',
  'TALL_IMAGE_CAPTION',
  'PAGINATION_END_SENTINEL',
]) {
  check(`pagination-text-${expected}`, paginationText.includes(expected), expected);
}

const screenshotHashes = {};
for (const [relativePath, expectedHash] of Object.entries(baselines)) {
  const actualHash = await sha256(relativePath);
  screenshotHashes[relativePath] = actualHash;
  check(`screenshot-${relativePath}`, actualHash === expectedHash, {
    actualHash,
    expectedHash,
  });
}

const failures = checks.filter(({ passed }) => !passed);
const report = {
  checks,
  screenshotHashes,
  summary: {
    failed: failures.length,
    passed: checks.length - failures.length,
    total: checks.length,
  },
};
const outputDirectory = path.join(root, 'docs', 'qa-artifacts', 'm5-5');
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'regression-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify(report.summary, null, 2));
if (failures.length > 0) {
  throw new Error(`M5.5 regression failed: ${failures.map(({ name }) => name).join(', ')}`);
}
