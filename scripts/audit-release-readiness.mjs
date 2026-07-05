import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

const root = process.cwd();

const requiredFiles = [
  'README.md',
  'README.zh-CN.md',
  'PRIVACY.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  '.releaseignore',
  'docs/USAGE.md',
  'docs/development/architecture.md',
  'docs/development/release-inventory.md',
  'docs/development/public-source-boundary.md',
  'docs/development/release-checklist.md',
  'docs/development/qa-checklist.md',
  'docs/store/privacy-disclosures.md',
  'docs/store/listing-en.md',
  'docs/store/listing-zh-CN.md',
  'docs/store/test-instructions.md',
  'native/wps-helper/README.md',
];

const forbiddenTrackedPrefixes = [
  '.reference-private/',
  '.output/',
  '.wxt/',
  '.tmp/',
  'tmp/',
  'node_modules/',
  'native/wps-helper/dist/',
];

const localOnlyTrackedPrefixes = [
  'release/',
  'docs/qa-artifacts/',
  'docs/qa-screenshots/',
  'AGENTS.md',
  'PROJECT_PLAN.md',
  'PROGRESS.md',
  'REFERENCE_ANALYSIS.md',
  'docs/reference/',
];

const forbiddenTrackedSuffixes = [
  '.crx',
  '.pem',
  '.key',
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
];

const result = {
  requiredFiles: [],
  forbiddenTracked: [],
  localOnlyTracked: [],
  localOnlyPresent: [],
  packageJson: {},
  manifest: {},
  privacy: {},
  notices: {},
  license: {},
  storeAssets: {},
  archives: {},
};

function fail(message) {
  const error = new Error(message);
  error.report = result;
  throw error;
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function scanFiles(directory = root, baseDirectory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = fullPath === baseDirectory
      ? ''
      : fullPath.slice(baseDirectory.length + 1).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if ([
        '.git',
        '.reference-private',
        'node_modules',
        '.output',
        '.wxt',
        '.tmp',
        'tmp',
        'release',
      ].includes(entry.name) || `${relativePath}/` === 'native/wps-helper/dist/') {
        if (
          localOnlyTrackedPrefixes.some((prefix) => `${relativePath}/`.startsWith(prefix))
            || forbiddenTrackedPrefixes.some((prefix) => `${relativePath}/`.startsWith(prefix))
        ) {
          result.localOnlyPresent.push(`${relativePath}/`);
        }
        continue;
      }
      files.push(...await scanFiles(fullPath, baseDirectory));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

async function zipEntries(relativePath) {
  const file = path.join(root, relativePath);
  if (!existsSync(file)) {
    return null;
  }
  const zip = await JSZip.loadAsync(await readFile(file));
  return Object.keys(zip.files);
}

for (const file of requiredFiles) {
  const present = existsSync(path.join(root, file));
  result.requiredFiles.push({ file, present });
  if (!present) {
    fail(`Required release file is missing: ${file}`);
  }
}

const scannedFiles = await scanFiles();
result.forbiddenTracked = scannedFiles.filter((entry) => (
  forbiddenTrackedPrefixes.some((prefix) => entry.startsWith(prefix))
    || forbiddenTrackedSuffixes.some((suffix) => entry.endsWith(suffix))
));
if (result.forbiddenTracked.length > 0) {
  fail(`Forbidden tracked release entries remain: ${result.forbiddenTracked.join(', ')}`);
}
result.localOnlyTracked = scannedFiles.filter((entry) => (
  localOnlyTrackedPrefixes.some((prefix) => entry.startsWith(prefix))
));

const packageJson = JSON.parse(await readText('package.json'));
result.packageJson = {
  name: packageJson.name,
  version: packageJson.version,
  hasReadinessScript: Boolean(packageJson.scripts?.['release:readiness']),
  hasPackageScript: Boolean(packageJson.scripts?.['release:package']),
};
if (!result.packageJson.hasReadinessScript || !result.packageJson.hasPackageScript) {
  fail('Release scripts are not wired in package.json.');
}

const privacy = await readText('PRIVACY.md');
result.privacy = {
  mentionsNativeMessaging: privacy.includes('nativeMessaging'),
  mentionsNoTelemetry: privacy.includes('telemetry') && privacy.includes('does not'),
  mentionsPackagedFonts: privacy.includes('Bundled PDF fonts'),
};
if (!Object.values(result.privacy).every(Boolean)) {
  fail('Privacy policy is missing current nativeMessaging, no-telemetry, or packaged-font disclosure.');
}

const notices = await readText('THIRD_PARTY_NOTICES.md');
result.notices = {
  mentionsPublicFonts: notices.includes('public/fonts/'),
  mentionsCascadia: notices.includes('Cascadia'),
  mentionsOfl: notices.includes('SIL Open Font License'),
};
if (!Object.values(result.notices).every(Boolean)) {
  fail('Third-party notices are missing current font/source details.');
}

const license = await readText('LICENSE');
const readme = await readText('README.md');
const readmeZh = await readText('README.zh-CN.md');
const packageJsonLicense = JSON.parse(await readText('package.json')).license;
result.license = {
  polyFormNoncommercial: license.includes('PolyForm Noncommercial License 1.0.0'),
  requiredNotice: license.includes('Required Notice: Copyright 2026 Throb7'),
  packageIdentifier: packageJsonLicense === 'PolyForm-Noncommercial-1.0.0',
  englishDisclosure: readme.includes('Commercial use is not permitted'),
  chineseDisclosure: readmeZh.includes('不允许商业使用'),
  noProjectMitClaim: !/Project source is released under the \[MIT License\]/u.test(readme),
};
if (!Object.values(result.license).every(Boolean)) {
  fail('Project license files or public disclosures are not synchronized.');
}

const promoDir = path.join(root, 'docs', 'store', 'promotional');
const promoFiles = existsSync(promoDir) ? await readdir(promoDir) : [];
result.storeAssets = {
  hasScreenshots: existsSync(path.join(root, 'docs', 'store', 'screenshots', 'export-actions.png'))
    && existsSync(path.join(root, 'docs', 'store', 'screenshots', 'export-settings.png')),
  hasSmallPromo: promoFiles.some((file) => /^small-promo\.(png|jpg|jpeg)$/i.test(file)),
};
if (!result.storeAssets.hasScreenshots || !result.storeAssets.hasSmallPromo) {
  fail('Store screenshots or small promotional image are missing.');
}

for (const [browser, relativePath] of Object.entries({
  chrome: 'release/v1.0.0/chrome/chatgpt2doc-chrome-v1.0.0.zip',
  edge: 'release/v1.0.0/edge/chatgpt2doc-edge-v1.0.0.zip',
  source: 'release/v1.0.0/source/chatgpt2doc-source-v1.0.0.zip',
})) {
  const entries = await zipEntries(relativePath);
  result.archives[browser] = entries ? {
    exists: true,
    hasRootManifest: entries.includes('manifest.json'),
    forbiddenEntries: entries.filter((entry) => forbiddenArchivePrefixes.some((prefix) => entry.startsWith(prefix))),
  } : { exists: false };
  if (browser !== 'source' && entries && !entries.includes('manifest.json')) {
    fail(`${browser} extension ZIP does not contain manifest.json at the root.`);
  }
  if (entries && result.archives[browser].forbiddenEntries.length > 0) {
    fail(`${browser} archive contains forbidden entries: ${result.archives[browser].forbiddenEntries.join(', ')}`);
  }
}

for (const [browser, manifestPath] of Object.entries({
  chrome: '.output/chrome-mv3/manifest.json',
  edge: '.output/edge-mv3/manifest.json',
})) {
  if (!existsSync(path.join(root, manifestPath))) {
    result.manifest[browser] = { exists: false };
    continue;
  }
  const manifest = JSON.parse(await readText(manifestPath));
  result.manifest[browser] = {
    exists: true,
    manifestVersion: manifest.manifest_version,
    permissions: manifest.permissions ?? [],
    optionalPermissions: manifest.optional_permissions ?? [],
    hostPermissions: manifest.host_permissions ?? [],
  };
  const permissions = JSON.stringify(result.manifest[browser].permissions);
  const optional = JSON.stringify(result.manifest[browser].optionalPermissions);
  if (permissions !== JSON.stringify(['storage'])) {
    fail(`${browser} manifest required permissions are not the expected storage-only set.`);
  }
  if (optional !== JSON.stringify(['nativeMessaging'])) {
    fail(`${browser} manifest optional permissions are not the expected nativeMessaging-only set.`);
  }
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  ...result,
}, null, 2)}\n`);
