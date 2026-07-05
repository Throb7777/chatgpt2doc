import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import JSZip from 'jszip';

const root = process.cwd();
const version = '1.0.0';
const releaseLabel = `v${version}-rc.1`;
const fixedDate = new Date('2026-06-23T00:00:00.000Z');
const releaseDir = path.join(root, 'release', releaseLabel);
const targets = [
  { browser: 'chrome', output: '.output/chrome-mv3' },
  { browser: 'edge', output: '.output/edge-mv3' },
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      shell: process.platform === 'win32',
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return [full];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}

async function zipDirectory(directory) {
  const zip = new JSZip();
  for (const file of await listFiles(directory)) {
    const relative = path.relative(directory, file).replaceAll('\\', '/');
    zip.file(relative, await readFile(file), {
      binary: true,
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
      date: fixedDate,
      createFolders: false,
    });
  }
  return zip.generateAsync({
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'DOS',
    streamFiles: false,
    type: 'nodebuffer',
  });
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

await rm(releaseDir, { force: true, recursive: true });
await mkdir(releaseDir, { recursive: true });
await run('npm', ['run', 'build:chrome']);
await run('npm', ['run', 'build:edge']);

const packages = [];
for (const target of targets) {
  const source = path.join(root, target.output);
  const first = await zipDirectory(source);
  const second = await zipDirectory(source);
  const deterministic = sha256(first) === sha256(second);
  const fileName = `chatgpt2doc-${releaseLabel}-${target.browser}-mv3.zip`;
  const relativePath = `release/${releaseLabel}/${fileName}`;
  await writeFile(path.join(root, relativePath), first);
  const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
  const files = await listFiles(source);
  packages.push({
    browser: target.browser,
    bytes: first.length,
    deterministic,
    file: relativePath,
    manifestVersion: manifest.version,
    sha256: sha256(first),
    sourceFileCount: files.length,
  });
}

const checksums = packages
  .map((item) => `${item.sha256}  ${path.basename(item.file)}`)
  .join('\n');
await writeFile(path.join(releaseDir, 'SHA256SUMS.txt'), `${checksums}\n`, 'utf8');

const report = {
  build: {
    date: fixedDate.toISOString(),
    releaseLabel,
    version,
  },
  packages,
  summary: {
    deterministic: packages.every((item) => item.deterministic),
    packageCount: packages.length,
  },
};
await writeFile(
  path.join(releaseDir, 'release-manifest.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
if (!report.summary.deterministic) process.exitCode = 1;
