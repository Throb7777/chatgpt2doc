import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checks = [];
const releaseLabel = 'v1.0.0-rc.5';

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
const docx = await json('docs/qa-artifacts/m12-3/m12-3-report.json');
const word = await json('docs/qa-artifacts/m12-3/m12-3-word365-acceptance.json');
const pdf = await json('docs/qa-artifacts/m12-4/m12-4-report.json');
const pdfVisual = await json('docs/qa-artifacts/m12-4/m12-4-visual-acceptance.json');
const release = await json(`release/${releaseLabel}/release-manifest.json`);
const a4Png = 'docs/qa-artifacts/m12-4/m12-4-pdf-fidelity-a4-page-1.png';
const letterPng = 'docs/qa-artifacts/m12-4/m12-4-pdf-fidelity-letter-page-1.png';
const [a4Size, letterSize, wordRender] = await Promise.all([
  pngSize(a4Png),
  pngSize(letterPng),
  stat('docs/qa-artifacts/m12-3/m12-3-word365-page-1.png'),
]);

check('m12-plan-state',
  taskStatus(plan, 'M12.2') === 'DONE'
    && taskStatus(plan, 'M12.3') === 'DONE'
    && taskStatus(plan, 'M12.4') === 'DONE'
    && ['IN_PROGRESS', 'DONE'].includes(taskStatus(plan, 'M12.5')),
  'M12.2-M12.4 are DONE and M12.5 is active or final');
check('m12-progress-state',
  progress.includes('Verified completed weight: **100 / 100**')
    && (progress.includes('| M12 | TBD | 0 | IN_PROGRESS |')
      || progress.includes('| M12 | TBD | 0 | DONE |')),
  'Base weight remains 100/100 and M12 is active or final');
check('chrome-matrix', chrome.summary.failed === 0 && chrome.summary.passed === 15, chrome.summary);
check('edge-smoke', edge.summary.failed === 0 && edge.summary.passed === 6, edge.summary);
check('pdf-regression',
  pdfRegression.summary.failed === 0 && pdfRegression.summary.passed === 50,
  pdfRegression.summary);
check('m12-docx-structure',
  docx.mathCount === 31
    && docx.mathParagraphCount === 20
    && docx.plainTauCount === 0
    && docx.size > 10_000
    && docx.textFigureStyle === 'ChatExportTextFigure'
    && JSON.stringify(docx.warningCodes) === JSON.stringify([]),
  docx);
check('word365-acceptance',
  word.application === 'Microsoft Word'
    && word.version === '16.0'
    && word.openedReadOnlyWithoutRepair === true
    && word.pages === 2
    && word.editableEquationObjects === 31
    && word.displayMathParagraphs === 20
    && word.plainTauTextRuns === 0
    && word.containsTextFigureLine1 === true
    && word.containsTextFigureLine2 === true
    && word.containsTextFigureLine3 === true
    && word.containsNegativeInferenceCases === true
    && word.visualReview === 'PASS'
    && wordRender.size > 100_000,
  word);
check('m12-pdf-structure',
  pdf.reports.length === 2
    && pdf.reports.every((item) => item.pages === 1
      && item.size > 900_000
      && item.invalidTextCharacters === 0
      && item.textFigurePage === 1
      && item.fontResources.every((count) => count <= 16)
      && item.textItems.every((count) => count >= 200)
      && JSON.stringify(item.warningCodes) === JSON.stringify([])),
  pdf.reports);
check('m12-pdf-visual-acceptance',
  pdfVisual.a4.visualReview === 'PASS'
    && pdfVisual.letter.visualReview === 'PASS'
    && Object.values(pdfVisual.checks).every(Boolean),
  pdfVisual.checks);
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

const outputDirectory = path.join(root, 'docs', 'qa-artifacts', 'm12-5');
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'fresh-real-export-release-candidate-acceptance.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
await writeFile(path.join(outputDirectory, 'fresh-real-export-release-candidate-acceptance.md'), `# M12.5 Fresh Real-Export Release Candidate Acceptance

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

- Word 365: \`docs/qa-artifacts/m12-3/m12-3-word365-acceptance.json\`
- PDF A4/Letter: \`docs/qa-artifacts/m12-4/m12-4-report.json\`
- PDF visual acceptance: \`docs/qa-artifacts/m12-4/m12-4-visual-acceptance.json\`
- Chrome integration: \`docs/qa-artifacts/m7-2/chrome-integration-report.json\`
- Edge smoke: \`docs/qa-artifacts/m7-4/edge-smoke-report.json\`
- PDF regression: \`docs/qa-artifacts/m5-5/regression-report.json\`
- Privacy and permissions: \`docs/qa-artifacts/m7-1/privacy-audit.json\`
- RC5 packages: \`release/${releaseLabel}/release-manifest.json\`
`, 'utf8');

process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
if (failures.length > 0) throw new Error(failures.map(({ name }) => name).join(', '));
