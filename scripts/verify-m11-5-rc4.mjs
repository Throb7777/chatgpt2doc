import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checks = [];
const releaseLabel = 'v1.0.0-rc.4';

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
const docx = await json('docs/qa-artifacts/m11-3/m11-3-report.json');
const word = await json('docs/qa-artifacts/m11-3/m11-3-word365-acceptance.json');
const pdf = await json('docs/qa-artifacts/m11-4/m11-4-report.json');
const release = await json(`release/${releaseLabel}/release-manifest.json`);
const a4Png = 'docs/qa-artifacts/m11-4/m11-4-real-world-a4-page-1.png';
const letterPng = 'docs/qa-artifacts/m11-4/m11-4-real-world-letter-page-1.png';
const [a4Size, letterSize, wordRender] = await Promise.all([
  pngSize(a4Png),
  pngSize(letterPng),
  stat('docs/qa-artifacts/m11-3/m11-3-word365-page-1.png'),
]);

check('m11-plan-state',
  taskStatus(plan, 'M11.2') === 'DONE'
    && taskStatus(plan, 'M11.3') === 'DONE'
    && taskStatus(plan, 'M11.4') === 'DONE'
    && ['IN_PROGRESS', 'DONE'].includes(taskStatus(plan, 'M11.5'))
    && (plan.includes('M11.5 RC4 regression and packaging in progress')
      || plan.includes('Current product version: 1.0.0-rc.4')),
  'M11.2-M11.4 are DONE and M11.5 is active or final');
check('m11-progress-state',
  progress.includes('Verified completed weight: **100 / 100**')
    && (progress.includes('| M11 | TBD | 0 | IN_PROGRESS |')
      || progress.includes('| M11 | TBD | 0 | DONE |')),
  'Base weight remains 100/100 and M11 is active or final');
check('chrome-matrix', chrome.summary.failed === 0 && chrome.summary.passed === 15, chrome.summary);
check('edge-smoke', edge.summary.failed === 0 && edge.summary.passed === 6, edge.summary);
check('pdf-regression',
  pdfRegression.summary.failed === 0 && pdfRegression.summary.passed === 50,
  pdfRegression.summary);
check('m11-docx-structure',
  docx.mathCount === 4
    && docx.breakCount === 2
    && docx.size > 9_000
    && JSON.stringify(docx.warningCodes) === JSON.stringify(['unsupported-content']),
  docx);
check('word365-acceptance',
  word.application === 'Microsoft Word'
    && word.version === '16.0'
    && word.openedReadOnlyWithoutRepair === true
    && word.editableEquationObjects === 4
    && word.containsTextFigureLine1 === true
    && word.containsTextFigureLine2 === true
    && word.containsTextFigureLine3 === true
    && word.containsTerminalTail === true
    && word.containsDraft === false
    && word.visualReview === 'PASS'
    && wordRender.size > 100_000,
  word);
check('m11-pdf-structure',
  pdf.reports.length === 2
    && pdf.reports.every((item) => item.pages === 1
      && item.bytes > 900_000
      && item.textItems === 53
      && JSON.stringify(item.warningCodes) === JSON.stringify(['unsupported-content'])),
  pdf.reports);
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

const outputDirectory = path.join(root, 'docs', 'qa-artifacts', 'm11-5');
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'real-world-release-candidate-acceptance.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
await writeFile(path.join(outputDirectory, 'real-world-release-candidate-acceptance.md'), `# M11.5 Real-World Release Candidate Acceptance

Date: 2026-06-27
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

- Word 365: \`docs/qa-artifacts/m11-3/m11-3-word365-acceptance.json\`
- PDF A4/Letter: \`docs/qa-artifacts/m11-4/m11-4-report.json\`
- Chrome integration: \`docs/qa-artifacts/m7-2/chrome-integration-report.json\`
- Edge smoke: \`docs/qa-artifacts/m7-4/edge-smoke-report.json\`
- PDF regression: \`docs/qa-artifacts/m5-5/regression-report.json\`
- Privacy and permissions: \`docs/qa-artifacts/m7-1/privacy-audit.json\`
- RC4 packages: \`release/${releaseLabel}/release-manifest.json\`
`, 'utf8');

process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
if (failures.length > 0) throw new Error(failures.map(({ name }) => name).join(', '));
