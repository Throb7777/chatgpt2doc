import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const root = process.cwd();
const version = process.argv[2] ?? 'v1.0.0';
const releaseRoot = path.join(root, 'release', version);

const sourceExcludes = [
  '.git/',
  '.agents/',
  '.codex/',
  '.reference-private/',
  '.private-docs/',
  '.tmp/',
  '.wxt/',
  '.output/',
  'tmp/',
  'node_modules/',
  'coverage/',
  'release/',
  'dist/',
  '__pycache__/',
  'native/wps-helper/dist/',
  'docs/store/screenshots/chatgpt2doc-preview-contact-sheet.png',
  'docs/qa-artifacts/',
  'docs/qa-screenshots/',
  'AGENTS.md',
  'PROJECT_PLAN.md',
  'PROGRESS.md',
  'REFERENCE_ANALYSIS.md',
  'docs/reference/',
  'docs/M14_',
  'docs/M15_',
  'docs/M16_',
  'docs/POST_RC_',
  'docs/RC',
  'docs/REAL_WORLD_',
];

const forbiddenArchivePrefixes = [
  '.git/',
  '.agents/',
  '.codex/',
  '.reference-private/',
  '.private-docs/',
  '.output/',
  '.wxt/',
  '.tmp/',
  'tmp/',
  'node_modules/',
  'native/wps-helper/dist/',
  'release/',
  'docs/qa-artifacts/',
  'docs/qa-screenshots/',
  'AGENTS.md',
  'PROJECT_PLAN.md',
  'PROGRESS.md',
  'REFERENCE_ANALYSIS.md',
  'docs/reference/',
];

function normalize(relativePath) {
  return relativePath.replaceAll('\\', '/');
}

function isExcluded(relativePath) {
  const normalized = normalize(relativePath);
  return sourceExcludes.some((pattern) => normalized === pattern.replace(/\/$/, '')
    || normalized.startsWith(pattern));
}

async function addDirectory(zip, directory, baseDirectory = directory, options = {}) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = normalize(path.relative(baseDirectory, fullPath));
    if (!options.includeExcluded && isExcluded(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      await addDirectory(zip, fullPath, baseDirectory, options);
    } else if (entry.isFile()) {
      zip.file(relativePath, await readFile(fullPath));
    }
  }
}

async function zipDirectory(sourceDirectory, outputFile, options = {}) {
  if (!existsSync(sourceDirectory)) {
    throw new Error(`Missing directory: ${sourceDirectory}`);
  }
  const zip = new JSZip();
  await addDirectory(zip, sourceDirectory, sourceDirectory, options);
  const content = await zip.generateAsync({
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    type: 'nodebuffer',
  });
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, content);
}

async function zipPublicSource(outputFile) {
  const zip = new JSZip();
  await addDirectory(zip, root);
  const content = await zip.generateAsync({
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    type: 'nodebuffer',
  });
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, content);
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function fileSize(file) {
  return (await stat(file)).size;
}

async function verifyZip(file, { requireManifest }) {
  const zip = await JSZip.loadAsync(await readFile(file));
  const entries = Object.keys(zip.files);
  if (requireManifest && !entries.includes('manifest.json')) {
    throw new Error(`${file} does not contain manifest.json at the ZIP root.`);
  }
  const forbidden = entries.filter((entry) => forbiddenArchivePrefixes.some((prefix) => entry.startsWith(prefix)));
  if (forbidden.length > 0) {
    throw new Error(`${file} contains forbidden entries: ${forbidden.join(', ')}`);
  }
  return entries.length;
}

await rm(releaseRoot, { force: true, recursive: true });

const outputs = {
  chrome: path.join(releaseRoot, 'chrome', 'chatgpt2doc-chrome-v1.0.0.zip'),
  edge: path.join(releaseRoot, 'edge', 'chatgpt2doc-edge-v1.0.0.zip'),
  helper: path.join(releaseRoot, 'wps-helper', 'chatgpt2doc-wps-helper-v1.0.0.zip'),
  helperSetup: path.join(releaseRoot, 'wps-helper', 'chatgpt2doc-wps-helper-setup-v1.0.0.exe'),
  source: path.join(releaseRoot, 'source', 'chatgpt2doc-source-v1.0.0.zip'),
};

await zipDirectory(path.join(root, '.output', 'chrome-mv3'), outputs.chrome);
await zipDirectory(path.join(root, '.output', 'edge-mv3'), outputs.edge);
const installerResult = spawnSync(process.execPath, [
  path.join(root, 'scripts', 'build-wps-helper-installer.mjs'),
  version,
], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit',
  windowsHide: true,
});
if (installerResult.status !== 0) {
  throw new Error('WPS helper installer build failed.');
}
await zipDirectory(path.join(root, 'native', 'wps-helper'), outputs.helper, { includeExcluded: true });
await zipPublicSource(outputs.source);

const report = {
  version,
  outputs: {},
};

for (const [name, file] of Object.entries(outputs)) {
  report.outputs[name] = {
    path: normalize(path.relative(root, file)),
    bytes: await fileSize(file),
    sha256: await sha256(file),
    entryCount: name === 'helperSetup'
      ? null
      : await verifyZip(file, { requireManifest: name === 'chrome' || name === 'edge' }),
  };
}

const checksumLines = Object.values(report.outputs)
  .map((entry) => `${entry.sha256}  ${entry.path}`)
  .join('\n');
await writeFile(path.join(releaseRoot, 'checksums.txt'), `${checksumLines}\n`, 'utf8');
await writeFile(path.join(releaseRoot, 'release-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
