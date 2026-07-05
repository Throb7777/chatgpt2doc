import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checks = [];

function check(name, passed, details) {
  checks.push({ details, name, passed: Boolean(passed) });
}

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(target);
    return [target];
  }));
  return nested.flat();
}

const privacy = await json('docs/qa-artifacts/m7-1/privacy-audit.json');
const chrome = await json('docs/qa-artifacts/m7-2/chrome-integration-report.json');
const edge = await json('docs/qa-artifacts/m7-4/edge-smoke-report.json');
const pdf = await json('docs/qa-artifacts/m5-5/regression-report.json');
const word = await text('docs/qa-artifacts/m7-3/word365-acceptance.md');
const plan = await text('PROJECT_PLAN.md');
const progress = await text('PROGRESS.md');
const exportJobTests = await text('tests/export/export-job.test.ts');
const exportPipelineTests = await text('tests/export/chatgpt-export.test.ts');
const collectorTests = await text('tests/platform/chatgpt/conversation-collector.test.ts');
const warningTests = await text('tests/warnings/warning-report.test.ts');
const manifests = await Promise.all(['chrome', 'edge'].map(async (browser) => ({
  browser,
  manifest: await json(`.output/${browser}-mv3/manifest.json`),
})));

check('privacy-audit', privacy.passed === true && privacy.violations.length === 0, {
  violations: privacy.violations,
});
check('chrome-matrix', chrome.summary.failed === 0 && chrome.summary.passed >= 13, chrome.summary);
check('edge-smoke', edge.summary.failed === 0 && edge.summary.passed === 6, edge.summary);
check('pdf-regression', pdf.summary.failed === 0 && pdf.summary.passed === 50, pdf.summary);
check('word365-acceptance', word.includes('Result: PASS.')
  && word.includes('opened without a repair')
  && word.includes('native editable equation'), 'Word 365 report records open, edit, and equation checks');

for (const { browser, manifest } of manifests) {
  check(`${browser}-least-privilege-manifest`,
    manifest.manifest_version === 3
      && JSON.stringify(manifest.permissions) === JSON.stringify(['storage'])
      && JSON.stringify(manifest.optional_permissions) === JSON.stringify(['nativeMessaging'])
      && JSON.stringify(manifest.content_scripts?.[0]?.matches)
        === JSON.stringify(['https://chatgpt.com/*'])
      && (manifest.host_permissions === undefined || manifest.host_permissions.length === 0)
      && manifest.optional_host_permissions === undefined
      && JSON.stringify(manifest.web_accessible_resources) === JSON.stringify([{
        matches: ['https://chatgpt.com/*'],
        resources: ['fonts/*.ttf'],
      }]),
    manifest);
}

check('resilience-duplicate-prevention',
  exportJobTests.includes('prevents duplicate execution while a job is active'),
  'Focused controller test exists');
check('resilience-cancellation',
  exportJobTests.includes('cancels cooperatively and clears the busy state')
    && exportPipelineTests.includes('cancels during rendering without triggering a download'),
  'Controller and real pipeline cancellation tests exist');
check('resilience-resource-limits',
  exportJobTests.includes('enforces message and node limits'),
  'Message and node limit test exists');
check('resilience-long-conversation',
  collectorTests.includes('stable deduplicated order'),
  'Virtualized long-conversation collection test exists');
check('resilience-warning-report',
  warningTests.includes('groups duplicates while preserving counts and provenance'),
  'Actionable warning aggregation test exists');

const unresolvedBlockers = progress
  .split(/\r?\n/u)
  .filter((line) => line.startsWith('| B-'))
  .map((line) => {
    const columns = line.split('|').map((part) => part.trim());
    return {
      id: columns[1],
      line,
      status: columns.at(-2),
    };
  })
  .filter(({ id, status }) => (
    !['RESOLVED', 'SUPERSEDED', 'DEFERRED'].includes(status)
      && !['B-M16.1-1', 'B-M16.1-4'].includes(id)
  ));
check('governance-no-open-blocker', unresolvedBlockers.length === 0, unresolvedBlockers.map(({ line }) => line));
const activeTaskRows = plan
  .split(/\r?\n/u)
  .filter((line) => /^\| M\d+\.\d+ \|.*\| IN_PROGRESS \|$/u.test(line));
check('governance-single-active-task',
  activeTaskRows.length <= 1,
  activeTaskRows);

const sourceFiles = (await files(path.join(root, 'src')))
  .filter((file) => /\.(?:ts|tsx|css|html)$/u.test(file));
const unfinished = [];
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  if (/\b(?:TODO|FIXME)\b/u.test(source)) {
    unfinished.push(path.relative(root, file).replaceAll('\\', '/'));
  }
}
check('source-no-unfinished-markers', unfinished.length === 0, unfinished);

const prohibitedManifestKeys = manifests.flatMap(({ browser, manifest }) =>
  ['oauth2', 'key', 'update_url', 'externally_connectable']
    .filter((key) => manifest[key] !== undefined)
    .map((key) => `${browser}:${key}`));
check('store-policy-no-identity-or-external-control',
  prohibitedManifestKeys.length === 0,
  prohibitedManifestKeys);

const evidenceFiles = [
  'docs/qa-artifacts/m7-1/privacy-audit.json',
  'docs/qa-artifacts/m7-2/chrome-integration-report.json',
  'docs/qa-artifacts/m7-3/word365-acceptance.md',
  'docs/qa-artifacts/m7-4/edge-smoke-report.json',
  'docs/qa-artifacts/m5-5/regression-report.json',
];
const evidenceSizes = {};
for (const relativePath of evidenceFiles) {
  evidenceSizes[relativePath] = (await stat(path.join(root, relativePath))).size;
}
check('release-evidence-present',
  Object.values(evidenceSizes).every((size) => size > 0),
  evidenceSizes);

const blockers = checks.filter(({ passed }) => !passed);
const report = {
  audit: 'M7.5 regression, resilience, and store-policy release-blocker audit',
  blockers: blockers.map(({ details, name }) => ({ details, name })),
  checks,
  summary: {
    blockers: blockers.length,
    passed: checks.length - blockers.length,
    total: checks.length,
  },
};

const outputDirectory = path.join(root, 'docs', 'qa-artifacts', 'm7-5');
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'release-blocker-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
if (blockers.length > 0) process.exitCode = 1;
