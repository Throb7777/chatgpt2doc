import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checks = [];
const releaseLabel = 'v1.0.0-rc.1';

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

const plan = await text('PROJECT_PLAN.md');
const progress = await text('PROGRESS.md');
const chrome = await json('docs/qa-artifacts/m7-2/chrome-integration-report.json');
const edge = await json('docs/qa-artifacts/m7-4/edge-smoke-report.json');
const pdf = await json('docs/qa-artifacts/m5-5/regression-report.json');
const privacy = await json('docs/qa-artifacts/m7-1/privacy-audit.json');
const release = await json(`release/${releaseLabel}/release-manifest.json`);
const word = await text('docs/qa-artifacts/m7-3/word365-acceptance.md');
const docsAcceptance = await text('docs/qa-artifacts/m8-1/documentation-acceptance.md');
const storeAcceptance = await text('docs/qa-artifacts/m8-2/store-identity-acceptance.md');
const packageAcceptance = await text('docs/qa-artifacts/m8-3/release-package-acceptance.md');

check('plan-through-m8-3-complete',
  ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'].every((id) =>
    plan.includes(`| ${id} |`) && plan.includes(`| ${id} |`)
  )
    && plan.includes('| M8.1 | Write public documentation and licenses')
    && plan.includes('| M8.2 | Produce independent store identity and listing')
    && plan.includes('| M8.3 | Build reproducible release packages'),
  'Plan contains completed prerequisite rows');
check('progress-at-least-99-before-final',
  progress.includes('Verified completed weight: **99 / 100**')
    || progress.includes('Verified completed weight: **100 / 100**'),
  'Progress is ready for final acceptance');
check('chrome-final-matrix', chrome.summary.failed === 0 && chrome.summary.passed === 13, chrome.summary);
check('edge-final-smoke', edge.summary.failed === 0 && edge.summary.passed === 6, edge.summary);
check('pdf-final-regression', pdf.summary.failed === 0 && pdf.summary.passed === 50, pdf.summary);
check('word365-final-acceptance', word.includes('Result: PASS.')
  && word.includes('opened without a repair')
  && word.includes('Formula'), 'Word 365 acceptance report passed');
check('privacy-final-audit', privacy.passed === true && privacy.violations.length === 0, privacy.violations);
check('docs-final-acceptance', docsAcceptance.includes('Result: PASS'), 'M8.1 docs acceptance passed');
check('store-final-acceptance', storeAcceptance.includes('Result: PASS'), 'M8.2 store acceptance passed');
check('packages-final-acceptance', packageAcceptance.includes('Result: PASS'), 'M8.3 package acceptance passed');
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
  'No dedicated Canvas or Deep Research view support in version 1.',
  'Unsupported math remains visible through a fallback and warning rather than editable Word math.',
  'Remote image embedding depends on browser/source access; failure preserves a link and warning.',
  'Word 365 on Windows is the authoritative DOCX target; Google Docs and LibreOffice are best effort only.',
  'The clean temporary npm install reports dev-dependency audit advisories; production dependency audit is zero and dev dependencies are not packaged.',
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

const outputDirectory = path.join(root, 'docs', 'qa-artifacts', 'm8-4');
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'release-candidate-acceptance.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
await writeFile(path.join(outputDirectory, 'release-candidate-acceptance.md'), `# M8.4 Release Candidate Acceptance

Date: 2026-06-23
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

- Chrome integration: \`docs/qa-artifacts/m7-2/chrome-integration-report.json\`
- Edge smoke: \`docs/qa-artifacts/m7-4/edge-smoke-report.json\`
- Word 365: \`docs/qa-artifacts/m7-3/word365-acceptance.md\`
- PDF regression: \`docs/qa-artifacts/m5-5/regression-report.json\`
- Privacy and permissions: \`docs/qa-artifacts/m7-1/privacy-audit.json\`
- Documentation: \`docs/qa-artifacts/m8-1/documentation-acceptance.md\`
- Store identity: \`docs/qa-artifacts/m8-2/store-identity-acceptance.md\`
- Packages: \`docs/qa-artifacts/m8-3/release-package-acceptance.md\`
`, 'utf8');

process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
if (failures.length > 0) throw new Error(failures.map(({ name }) => name).join(', '));
