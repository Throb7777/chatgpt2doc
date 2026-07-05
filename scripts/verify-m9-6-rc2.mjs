import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checks = [];
const releaseLabel = 'v1.0.0-rc.2';

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
const screenshots = await json('docs/qa-screenshots/m3-4/qa-summary.json');

check('m9-plan-state',
  plan.includes('| M9.5 | Expand settings and migrate storage')
    && plan.includes('| M9.5 | Expand settings and migrate storage |')
    && plan.includes('| M9.6 | Regression and RC2 packaging')
    && plan.includes('| M9 | Reference-informed no-scroll export and UI refinement | TBD | DONE |')
    && plan.includes('| M9.6 | Regression and RC2 packaging | Updated Chrome/Edge artifacts and acceptance evidence for the UX release candidate | M9.2-M9.5 | Full check, Chrome matrix, Edge smoke, privacy audit, DOCX/PDF regression, and clean package verification pass | TBD | DONE |'),
  'M9 rows are final DONE state');
check('m9-progress-state',
  progress.includes('Current task: None')
    && progress.includes('UX Release Candidate 2 complete with packages under `release/v1.0.0-rc.2`')
    && progress.includes('| M9 | TBD | 0 | DONE | M9.1-M9.6 verified; UX Release Candidate 2 complete; M9 weighting remains TBD |'),
  'Progress records final M9.6 completion');
check('chrome-matrix', chrome.summary.failed === 0 && chrome.summary.passed === 15, chrome.summary);
check('edge-smoke', edge.summary.failed === 0 && edge.summary.passed === 6, edge.summary);
check('pdf-regression', pdf.summary.failed === 0 && pdf.summary.passed === 50, pdf.summary);
check('privacy-audit', privacy.passed === true && privacy.violations.length === 0, privacy.violations);
check('visual-keyboard-qa', screenshots.passed === true
  && screenshots.results.every((item) => item.passed === true), screenshots.results);
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
  'Remote image embedding depends on browser/source access; failure preserves a link and warning.',
  'Word 365 on Windows is the authoritative DOCX target; Google Docs and LibreOffice are best effort only.',
  'No dedicated Canvas or Deep Research view support in this UX release candidate.',
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

const outputDirectory = path.join(root, 'docs', 'qa-artifacts', 'm9-6');
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'ux-release-candidate-acceptance.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
await writeFile(path.join(outputDirectory, 'ux-release-candidate-acceptance.md'), `# M9.6 UX Release Candidate Acceptance

Date: 2026-06-25
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
- PDF regression: \`docs/qa-artifacts/m5-5/regression-report.json\`
- Privacy and permissions: \`docs/qa-artifacts/m7-1/privacy-audit.json\`
- Visual and keyboard QA: \`docs/qa-screenshots/m3-4/qa-summary.json\`
- RC2 packages: \`release/${releaseLabel}/release-manifest.json\`
`, 'utf8');

process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
if (failures.length > 0) throw new Error(failures.map(({ name }) => name).join(', '));
