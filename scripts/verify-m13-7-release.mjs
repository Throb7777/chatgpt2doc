import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const checks = [];
const releaseLabel = 'v1.0.0-rc.6';

function check(name, passed, details) {
  checks.push({ details, name, passed: Boolean(passed) });
}

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function sha256(relativePath) {
  return createHash('sha256')
    .update(await readFile(path.join(root, relativePath)))
    .digest('hex');
}

async function pngSize(relativePath) {
  const buffer = await readFile(path.join(root, relativePath));
  return { height: buffer.readUInt32BE(20), width: buffer.readUInt32BE(16) };
}

function taskStatus(planText, id) {
  return planText.split(/\r?\n/u)
    .find((line) => line.startsWith(`| ${id} |`))
    ?.split('|')
    .at(-2)
    ?.trim();
}

const plan = await text('PROJECT_PLAN.md');
const progress = await text('PROGRESS.md');
const chrome = await json('docs/qa-artifacts/m7-2/chrome-integration-report.json');
const edge = await json('docs/qa-artifacts/m7-4/edge-smoke-report.json');
const pdfRegression = await json('docs/qa-artifacts/m5-5/regression-report.json');
const privacy = await json('docs/qa-artifacts/m7-1/privacy-audit.json');
const docx = await json('docs/qa-artifacts/m13-5/m13-5-report.json');
const word = await json('docs/qa-artifacts/m13-5/m13-5-word365-acceptance.json');
const pdf = await json('docs/qa-artifacts/m13-6/m13-6-report.json');
const pdfVisual = await json('docs/qa-artifacts/m13-6/m13-6-visual-acceptance.json');
const release = await json(`release/${releaseLabel}/release-manifest.json`);
const [a4Size, letterSize, wordPage1, wordPage2] = await Promise.all([
  pngSize('docs/qa-artifacts/m13-6/a4-render/m13-6-a4-page-1.png'),
  pngSize('docs/qa-artifacts/m13-6/letter-render/m13-6-letter-page-1.png'),
  stat('docs/qa-artifacts/m13-5/word365-render/m13-5-word365-page-1.png'),
  stat('docs/qa-artifacts/m13-5/word365-render/m13-5-word365-page-2.png'),
]);

check('m13-plan-state',
  taskStatus(plan, 'M13.5') === 'DONE'
    && taskStatus(plan, 'M13.6') === 'DONE'
    && ['IN_PROGRESS', 'DONE'].includes(taskStatus(plan, 'M13.7')),
  'M13.5-M13.6 are DONE and M13.7 is active or final');
check('m13-progress-state',
  progress.includes('Verified completed weight: **100 / 100**')
    && (progress.includes('| M13 | TBD | 0 | IN_PROGRESS |')
      || progress.includes('| M13 | TBD | 0 | DONE |')),
  'Base weight remains 100/100 and M13 is active or final');
check('chrome-matrix', chrome.summary.failed === 0 && chrome.summary.passed === 15, chrome.summary);
check('edge-smoke', edge.summary.failed === 0 && edge.summary.passed === 6, edge.summary);
check('pdf-regression',
  pdfRegression.summary.failed === 0 && pdfRegression.summary.passed === 50,
  pdfRegression.summary);
check('m13-docx-structure',
  docx.mathObjects === 31
    && docx.displayMathParagraphs === 20
    && docx.plainTauTextRuns === 0
    && docx.textFigureMathObjects === 4
    && docx.textFigureParagraphs === 2
    && docx.size > 10_000
    && JSON.stringify(docx.warningCodes) === JSON.stringify([]),
  docx);
check('word365-acceptance',
  word.application === 'Microsoft Word'
    && word.productVersion === '16.0.20026.20182'
    && word.openedWithoutRepair === true
    && word.sourceDocumentUnchanged === true
    && word.pages === 2
    && word.editableEquationObjects === 31
    && word.displayMathParagraphs === 20
    && word.plainTauTextRuns === 0
    && word.textFigureMathObjects === 4
    && word.textFigureParagraphs === 2
    && word.visualReview === 'PASS'
    && wordPage1.size > 80_000
    && wordPage2.size > 10_000,
  word);
check('m13-pdf-structure',
  pdf.reports.length === 2
    && pdf.reports.every((item) => item.pages === 1
      && item.size > 950_000
      && item.invalidTextCharacters === 0
      && item.textFigurePage === 1
      && item.fontResources.every((count) => count <= 16)
      && item.textItems.every((count) => count <= 260)
      && JSON.stringify(item.warningCodes) === JSON.stringify([])
      && item.baseFonts.some((font) => font.includes('NotoSerif'))
      && item.baseFonts.some((font) => font.includes('NotoSansMono'))
      && item.baseFonts.every((font) => !/Times|Courier|Symbol|ArialUnicode/u.test(font))),
  pdf.reports);
check('m13-pdf-visual-acceptance',
  pdfVisual.status === 'PASS'
    && pdfVisual.visualReview.a4 === 'PASS'
    && pdfVisual.visualReview.letter === 'PASS'
    && pdfVisual.visualReview.findings.length === 0
    && pdfVisual.poppler.missingFontWarnings === 0,
  pdfVisual.visualReview);
check('pdf-a4-150dpi-render', a4Size.width === 1241 && a4Size.height === 1754, a4Size);
check('pdf-letter-150dpi-render',
  letterSize.width === 1275 && letterSize.height === 1650,
  letterSize);
check('privacy-audit', privacy.passed === true && privacy.violations.length === 0, privacy.violations);
check('release-packages',
  release.build.releaseLabel === releaseLabel
    && release.build.version === '1.0.0'
    && release.packages.length === 2
    && release.summary.deterministic === true,
  release.build);
for (const item of release.packages) {
  check(`release-${item.browser}-hash`,
    await sha256(item.file) === item.sha256,
    { file: item.file, sha256: item.sha256 });
}

const knownLimitations = [
  'Complete conversation scan may intentionally move the page after explicit selection; quick visible exports avoid page movement.',
  'Unsupported math remains visible through a fallback and warning rather than editable Word math.',
  'Math/symbol-heavy PDFs embed complete local OFL fonts for rendering correctness and can be approximately 950 KB or larger.',
  'Remote image embedding depends on browser/source access; failure preserves a link and warning.',
  'Word 365 on Windows is the authoritative DOCX target; Google Docs and LibreOffice are best effort only.',
  'No dedicated Canvas or Deep Research view support in this release candidate.',
];

const failures = checks.filter(({ passed }) => !passed);
const report = {
  checks,
  knownLimitations,
  release,
  summary: {
    failed: failures.length,
    passed: checks.length - failures.length,
    total: checks.length,
  },
};

const outputDirectory = path.join(root, 'docs', 'qa-artifacts', 'm13-7');
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'actual-export-parity-release-candidate-acceptance.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
await writeFile(path.join(outputDirectory, 'actual-export-parity-release-candidate-acceptance.md'), `# M13.7 Actual-Export Parity Release Candidate Acceptance

Date: 2026-06-29
Result: ${failures.length === 0 ? 'PASS' : 'FAIL'}
Release: ${releaseLabel}
Manifest version: 1.0.0

## Build Artifacts

${release.packages.map((item) => `- \`${item.file}\` - ${item.bytes} bytes - SHA-256 \`${item.sha256}\``).join('\n')}

## Final Checks

${checks.map((item) => `- ${item.passed ? 'PASS' : 'FAIL'} - ${item.name}`).join('\n')}

## Known Limitations

${knownLimitations.map((item) => `- ${item}`).join('\n')}

## Evidence

- Word 365: \`docs/qa-artifacts/m13-5/m13-5-word365-acceptance.json\`
- DOCX structure: \`docs/qa-artifacts/m13-5/m13-5-report.json\`
- PDF A4/Letter: \`docs/qa-artifacts/m13-6/m13-6-report.json\`
- PDF visual acceptance: \`docs/qa-artifacts/m13-6/m13-6-visual-acceptance.json\`
- Chrome integration: \`docs/qa-artifacts/m7-2/chrome-integration-report.json\`
- Edge smoke: \`docs/qa-artifacts/m7-4/edge-smoke-report.json\`
- PDF regression: \`docs/qa-artifacts/m5-5/regression-report.json\`
- Privacy and permissions: \`docs/qa-artifacts/m7-1/privacy-audit.json\`
- RC6 packages: \`release/${releaseLabel}/release-manifest.json\`
`, 'utf8');

process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
if (failures.length > 0) throw new Error(failures.map(({ name }) => name).join(', '));
