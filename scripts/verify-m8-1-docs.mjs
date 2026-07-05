import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'README.md',
  'README.zh-CN.md',
  'PRIVACY.md',
  'PRIVACY.zh-CN.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'docs/USAGE.md',
  'docs/USAGE.zh-CN.md',
];
const checks = [];

function check(name, passed, details) {
  checks.push({ details, name, passed: Boolean(passed) });
}

for (const file of required) {
  await access(path.join(root, file));
  check(`file-${file}`, true, file);
}

const readme = await readFile(path.join(root, 'README.md'), 'utf8');
const readmeZh = await readFile(path.join(root, 'README.zh-CN.md'), 'utf8');
const privacy = await readFile(path.join(root, 'PRIVACY.md'), 'utf8');
const privacyZh = await readFile(path.join(root, 'PRIVACY.zh-CN.md'), 'utf8');
const notices = await readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
const license = await readFile(path.join(root, 'LICENSE'), 'utf8');
const chromeManifest = JSON.parse(
  await readFile(path.join(root, '.output/chrome-mv3/manifest.json'), 'utf8'),
);
const edgeManifest = JSON.parse(
  await readFile(path.join(root, '.output/edge-mv3/manifest.json'), 'utf8'),
);

check('readme-bilingual-links',
  /(?:\(|href=")README\.zh-CN\.md/u.test(readme)
    && /(?:\(|href=")README\.md/u.test(readmeZh)
    && /(?:\(|href=")PRIVACY\.md/u.test(readme)
    && /(?:\(|href=")docs\/USAGE\.md/u.test(readme)
    && /(?:\(|href=")PRIVACY\.zh-CN\.md/u.test(readmeZh)
    && /(?:\(|href=")docs\/USAGE\.zh-CN\.md/u.test(readmeZh)
    && /(?:\(|href=")PRIVACY\.zh-CN\.md/u.test(privacy)
    && /(?:\(|href=")PRIVACY\.md/u.test(privacyZh),
  'Public entry points link to each other');
check('readme-scopes',
  readme.toLowerCase().includes('one assistant response')
    && /(?:full|complete) conversation/u.test(readme.toLowerCase())
    && readme.toLowerCase().includes('assistant-only')
    && readme.toLowerCase().includes('selected messages'),
  'All verified scopes documented');
check('privacy-local-processing',
  privacy.includes('processes ChatGPT conversation content locally')
    && privacy.includes('does not collect, sell, transmit, or retain')
    && privacyZh.includes('浏览器本地处理 ChatGPT 对话内容')
    && privacyZh.includes('不会把对话正文'),
  'Local processing and no collection claims present');
check('privacy-image-boundary',
  /omits\s+credentials/u.test(privacy)
    && privacy.includes('suppresses the page referrer')
    && privacy.includes('request URL and IP address'),
  'Remote image boundary is explicit');
check('manifest-doc-alignment',
  [chromeManifest, edgeManifest].every((manifest) =>
    JSON.stringify(manifest.permissions) === JSON.stringify(['storage'])
      && JSON.stringify(manifest.optional_permissions) === JSON.stringify(['nativeMessaging'])
      && JSON.stringify(manifest.content_scripts?.[0]?.matches)
        === JSON.stringify(['https://chatgpt.com/*']))
    && privacy.includes('`storage`')
    && privacy.includes('`nativeMessaging`')
    && privacy.includes('`https://chatgpt.com/*`'),
  'Documentation matches both built manifests');
check('noncommercial-license',
  license.includes('PolyForm Noncommercial License 1.0.0')
    && license.includes('Required Notice: Copyright 2026 Throb7')
    && license.includes('Any noncommercial purpose is a permitted purpose.'),
  'Project PolyForm Noncommercial license present');
check('third-party-production-dependencies',
  [
    'docx',
    'pdf-lib',
    '@pdf-lib/fontkit',
    'preact',
    'Noto Sans',
    'Noto Sans Mono',
    'Noto Sans SC',
    'Noto Serif',
    'Cascadia Mono',
  ]
    .every((name) => notices.includes(name)),
  'Production libraries and bundled fonts are attributed');
check('third-party-font-license-files',
  notices.includes('public/fonts/')
    && notices.includes('src/assets/fonts/noto-sans/OFL-1.1.txt')
    && notices.includes('src/assets/fonts/noto-sans-mono/OFL-1.1.txt')
    && notices.includes('src/assets/fonts/noto-sans-sc/OFL-1.1.txt')
    && notices.includes('src/assets/fonts/noto-serif/OFL-1.1.txt'),
  'OFL license files are referenced');

const failures = checks.filter(({ passed }) => !passed);
process.stdout.write(`${JSON.stringify({
  failed: failures.length,
  passed: checks.length - failures.length,
  total: checks.length,
}, null, 2)}\n`);
if (failures.length > 0) {
  throw new Error(failures.map(({ name }) => name).join(', '));
}
