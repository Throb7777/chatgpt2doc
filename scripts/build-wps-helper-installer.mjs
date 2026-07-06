import { existsSync } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const version = process.argv[2] ?? 'v1.0.0';
const releaseRoot = path.join(root, 'release', version, 'wps-helper');
const setupName = 'chatgpt2doc-wps-helper-setup-v1.0.0.exe';
const setupPath = path.join(releaseRoot, setupName);
const scriptPath = path.join(root, 'native', 'wps-helper', 'installer', 'chatgpt2doc-wps-helper.iss');
const helperBuildScript = path.join(root, 'native', 'wps-helper', 'build.ps1');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) {
    const detail = [
      result.stderr?.trim(),
      result.stdout?.trim(),
    ].filter(Boolean).join('\n');
    throw new Error(`${command} ${args.join(' ')} failed.${detail ? `\n${detail}` : ''}`);
  }
  return result.stdout ?? '';
}

function findIscc() {
  const fromPath = spawnSync('where.exe', ['ISCC.exe'], {
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
  });
  if (fromPath.status === 0) {
    const candidate = fromPath.stdout.split(/\r?\n/u).map((line) => line.trim()).find(Boolean);
    if (candidate && existsSync(candidate)) return candidate;
  }

  const candidates = [
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

if (!existsSync(scriptPath)) {
  throw new Error(`Missing Inno Setup script: ${scriptPath}`);
}

const iscc = findIscc();
if (!iscc) {
  throw new Error(
    'Inno Setup compiler was not found. Install Inno Setup 6 and rerun npm run release:package.',
  );
}

await mkdir(releaseRoot, { recursive: true });
await rm(setupPath, { force: true });

run('powershell', [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  helperBuildScript,
]);

const isccArgs = [
  `/O${releaseRoot}`,
  scriptPath,
];
const defaultExtensionId = process.env.CHATGPT2DOC_EXTENSION_ID?.trim();
if (defaultExtensionId) {
  if (!/^[a-p]{32}$/u.test(defaultExtensionId)) {
    throw new Error('CHATGPT2DOC_EXTENSION_ID must be a 32-character Chrome extension ID using letters a-p.');
  }
  isccArgs.unshift(`/DDefaultExtensionId=${defaultExtensionId}`);
}

run(iscc, isccArgs);

if (!existsSync(setupPath)) {
  throw new Error(`Expected installer was not produced: ${setupPath}`);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  path: path.relative(root, setupPath).replaceAll('\\', '/'),
  bytes: (await stat(setupPath)).size,
  defaultExtensionId: defaultExtensionId || null,
}, null, 2)}\n`);
