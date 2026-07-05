import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import JSZip from 'jszip';

const root = process.cwd();
const releaseLabel = 'v1.0.0-rc.2';
const releaseDir = path.join(root, 'release', releaseLabel);
const checks = [];

function check(name, passed, details) {
  checks.push({ details, name, passed: Boolean(passed) });
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

const report = JSON.parse(await readFile(path.join(releaseDir, 'release-manifest.json'), 'utf8'));
const sums = await readFile(path.join(releaseDir, 'SHA256SUMS.txt'), 'utf8');

check('release-label', report.build.releaseLabel === releaseLabel, report.build);
check('release-version', report.build.version === '1.0.0', report.build);
check('deterministic-packages',
  report.summary.deterministic === true
    && report.packages.every((item) => item.deterministic === true),
  report.summary);
check('checksum-file',
  report.packages.every((item) => sums.includes(`${item.sha256}  ${path.basename(item.file)}`)),
  sums.trim().split(/\r?\n/u));

for (const item of report.packages) {
  const buffer = await readFile(path.join(root, item.file));
  check(`${item.browser}-hash`, sha256(buffer) === item.sha256, item.file);
  check(`${item.browser}-nonempty`, buffer.length === item.bytes && item.bytes > 1_000_000, item.bytes);
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).sort();
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  check(`${item.browser}-manifest`,
    manifest.manifest_version === 3
      && manifest.version === '1.0.0'
      && manifest.name === 'ChatGPT2Doc'
      && JSON.stringify(manifest.permissions) === JSON.stringify(['storage'])
      && JSON.stringify(manifest.content_scripts?.[0]?.matches)
        === JSON.stringify(['https://chatgpt.com/*']),
    manifest);
  for (const icon of ['icon/16.png', 'icon/32.png', 'icon/48.png', 'icon/128.png']) {
    check(`${item.browser}-${icon}`, Boolean(zip.file(icon)), icon);
  }
  check(`${item.browser}-no-source-maps`, names.every((name) => !name.endsWith('.map')), names);
  check(`${item.browser}-no-reference-assets`,
    names.every((name) => !name.toLowerCase().includes('reference')),
    names);
}

const failures = checks.filter(({ passed }) => !passed);
process.stdout.write(`${JSON.stringify({
  failed: failures.length,
  passed: checks.length - failures.length,
  total: checks.length,
}, null, 2)}\n`);
if (failures.length > 0) throw new Error(failures.map(({ name }) => name).join(', '));
