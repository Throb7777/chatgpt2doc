import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const checks = [];

function check(name, passed, details) {
  checks.push({ details, name, passed: Boolean(passed) });
}

async function pngSize(relativePath) {
  const data = await readFile(path.join(root, relativePath));
  const signature = data.subarray(0, 8).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  return {
    bytes: data.length,
    height: data.readUInt32BE(20),
    signature,
    width: data.readUInt32BE(16),
  };
}

for (const size of [16, 32, 48, 128]) {
  const relativePath = `public/icon/${size}.png`;
  const image = await pngSize(relativePath);
  check(`icon-${size}`, image.signature && image.width === size && image.height === size, image);
}

for (const relativePath of [
  'docs/store/screenshots/export-actions.png',
  'docs/store/screenshots/export-settings.png',
]) {
  const image = await pngSize(relativePath);
  check(`screenshot-${relativePath}`,
    image.signature && image.width === 1280 && image.height === 800,
    image);
}

const smallPromo = await pngSize('docs/store/promotional/small-promo.png');
check('small-promo',
  smallPromo.signature && smallPromo.width === 440 && smallPromo.height === 280,
  smallPromo);

const manifest = JSON.parse(
  await readFile(path.join(root, '.output/chrome-mv3/manifest.json'), 'utf8'),
);
const expectedIcons = {
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
  128: 'icon/128.png',
};
check('manifest-icons',
  JSON.stringify(manifest.icons) === JSON.stringify(expectedIcons)
    && JSON.stringify(manifest.action?.default_icon) === JSON.stringify(expectedIcons),
  { action: manifest.action?.default_icon, icons: manifest.icons });

const listingEn = await readFile(path.join(root, 'docs/store/listing-en.md'), 'utf8');
const listingZh = await readFile(path.join(root, 'docs/store/listing-zh-CN.md'), 'utf8');
const disclosures = await readFile(
  path.join(root, 'docs/store/privacy-disclosures.md'),
  'utf8',
);
const checklist = await readFile(path.join(root, 'docs/store/asset-checklist.md'), 'utf8');
check('listing-independent-disclaimer',
  listingEn.includes('not affiliated with, endorsed by, or sponsored by OpenAI')
    && listingZh.includes('不存在隶属、认可或赞助关系'),
  'Both listings include non-affiliation language');
check('listing-local-purpose',
  /conversation parsing and document generation happen on your\s+device/u.test(listingEn)
    && listingZh.includes('对话解析和文档生成都在本机完成'),
  'Both listings describe local processing');
check('listing-source-link',
  listingEn.includes('https://github.com/Throb7777/chatgpt2doc')
    && listingZh.includes('https://github.com/Throb7777/chatgpt2doc'),
  'Both listings link to the public source project');
check('disclosure-permissions',
  disclosures.includes('`storage`')
    && disclosures.includes('`https://chatgpt.com/*`')
    && disclosures.includes('No remote code'),
  'Permission and remote-code answers present');
check('asset-checklist-complete',
  !checklist.includes('- [ ]'),
  'Every independent identity check is complete');
check('generator-present',
  (await stat(path.join(root, 'scripts/generate-extension-icons.py'))).size > 0,
  'Original icon generator retained');

const failures = checks.filter(({ passed }) => !passed);
process.stdout.write(`${JSON.stringify({
  failed: failures.length,
  passed: checks.length - failures.length,
  total: checks.length,
}, null, 2)}\n`);
if (failures.length > 0) throw new Error(failures.map(({ name }) => name).join(', '));
