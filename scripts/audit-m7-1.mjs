import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import ts from 'typescript';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const reportPath = path.join(root, 'docs', 'qa-artifacts', 'm7-1', 'privacy-audit.json');
const manifestPaths = {
  chrome: path.resolve(
    root,
    process.env.CHAT_EXPORT_CHROME_BUILD_DIR ?? path.join('.output', 'chrome-mv3'),
    'manifest.json',
  ),
  edge: path.join(root, '.output', 'edge-mv3', 'manifest.json'),
};

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function location(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    column: position.character + 1,
    file: relative(sourceFile.fileName),
    line: position.line + 1,
  };
}

function inspectSource(file, text) {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const networkCalls = [];
  const forbiddenCalls = [];
  const remoteUrlLiterals = [];

  function visit(node) {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && /^https?:\/\//iu.test(node.text)
    ) {
      remoteUrlLiterals.push({ ...location(sourceFile, node), value: node.text });
    }

    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression) && expression.text === 'fetch') {
        networkCalls.push({
          ...location(sourceFile, node),
          kind: file.endsWith('pdf-fonts.ts') ? 'bundled-font-read' : 'image-read',
        });
      } else if (
        ts.isPropertyAccessExpression(expression)
        && expression.name.text === 'fetch'
      ) {
        networkCalls.push({
          ...location(sourceFile, node),
          kind: 'injected-image-read',
        });
      } else if (
        ts.isPropertyAccessExpression(expression)
        && expression.name.text === 'sendBeacon'
      ) {
        forbiddenCalls.push({
          ...location(sourceFile, node),
          api: 'sendBeacon',
        });
      }
    }

    if (
      ts.isNewExpression(node)
      && ts.isIdentifier(node.expression)
      && ['EventSource', 'WebSocket', 'XMLHttpRequest'].includes(node.expression.text)
    ) {
      forbiddenCalls.push({
        ...location(sourceFile, node),
        api: node.expression.text,
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { forbiddenCalls, networkCalls, remoteUrlLiterals };
}

function verifyManifest(browser, manifest) {
  const violations = [];
  if (manifest.manifest_version !== 3) violations.push('manifest_version must be 3');
  if (JSON.stringify(manifest.permissions ?? []) !== JSON.stringify(['storage'])) {
    violations.push('permissions must contain only storage');
  }
  if (
    JSON.stringify(manifest.optional_permissions ?? [])
    !== JSON.stringify(['nativeMessaging'])
  ) {
    violations.push('optional_permissions must contain only nativeMessaging');
  }
  for (const key of [
    'host_permissions',
    'optional_host_permissions',
    'externally_connectable',
  ]) {
    if (key in manifest) violations.push(`${key} must be absent`);
  }
  const accessibleResources = manifest.web_accessible_resources ?? [];
  if (
    accessibleResources.length !== 1
    || JSON.stringify(accessibleResources[0]?.resources) !== JSON.stringify(['fonts/*.ttf'])
    || JSON.stringify(accessibleResources[0]?.matches) !== JSON.stringify(['https://chatgpt.com/*'])
  ) {
    violations.push('web_accessible_resources must expose only packaged TTF fonts to ChatGPT');
  }
  const scripts = manifest.content_scripts ?? [];
  if (
    scripts.length !== 1
    || JSON.stringify(scripts[0]?.matches) !== JSON.stringify(['https://chatgpt.com/*'])
  ) {
    violations.push('content script must match only https://chatgpt.com/*');
  }
  return {
    browser,
    contentScriptMatches: scripts[0]?.matches ?? [],
    optionalPermissions: manifest.optional_permissions ?? [],
    permissions: manifest.permissions ?? [],
    webAccessibleResources: accessibleResources,
    violations,
  };
}

const files = await sourceFiles(sourceRoot);
const inspections = await Promise.all(files.map(async (file) =>
  inspectSource(file, await readFile(file, 'utf8'))));
const networkCalls = inspections.flatMap(({ networkCalls: calls }) => calls);
const forbiddenCalls = inspections.flatMap(({ forbiddenCalls: calls }) => calls);
const remoteUrlLiterals = inspections.flatMap(({ remoteUrlLiterals: urls }) => urls);
const manifests = await Promise.all(Object.entries(manifestPaths).map(async ([browser, file]) =>
  verifyManifest(browser, JSON.parse(await readFile(file, 'utf8')))));

const expectedNetworkCalls = new Set([
  'src/assets/image-resolver.ts:image-read',
  'src/assets/image-resolver.ts:injected-image-read',
  'src/renderers/pdf/pdf-fonts.ts:bundled-font-read',
]);
const unexpectedNetworkCalls = networkCalls.filter(({ file, kind }) =>
  !expectedNetworkCalls.has(`${file}:${kind}`));
const missingNetworkCalls = [...expectedNetworkCalls].filter((expected) =>
  !networkCalls.some(({ file, kind }) => `${file}:${kind}` === expected));
const allowedUrlLiterals = new Set([
  'http://www.w3.org/2000/svg',
  'https://chatgpt.com/*',
]);
const allowedUrlLocations = new Set([
  'src/integrations/wps/wps-document.ts:https://chatgpt.com/',
  'src/ui/settings/SettingsPanel.tsx:https://github.com/Throb7777/chatgpt2doc/releases/tag/v1.0.0',
]);
const unexpectedRemoteUrls = remoteUrlLiterals.filter(({ file, value }) =>
  !allowedUrlLiterals.has(value) && !allowedUrlLocations.has(`${file}:${value}`));

const settingsSource = await readFile(path.join(sourceRoot, 'settings', 'settings.ts'), 'utf8');
const storageFiles = [];
for (const file of files) {
  if ((await readFile(file, 'utf8')).includes('browser.storage')) storageFiles.push(relative(file));
}
const storage = {
  files: storageFiles,
  key: settingsSource.match(/const SETTINGS_KEY = '([^']+)'/u)?.[1] ?? null,
  persistedFields: [
    'codeStyle',
    'collectionMode',
    'copyTarget',
    'defaultScope',
    'fileName',
    'includePrompts',
    'language',
    'panelCollapsed',
    'panelPosition',
    'paper',
    'recentCount',
    'showExportDiagnostics',
    'showPerMessageActions',
    'theme',
    'wpsEditableCopy',
  ],
};
const storageViolations = [];
if (JSON.stringify(storageFiles) !== JSON.stringify(['src/settings/settings.ts'])) {
  storageViolations.push('browser.storage is used outside the settings module');
}
if (storage.key !== 'chatExport.settings.v2') {
  storageViolations.push('unexpected settings storage key');
}

const violations = [
  ...manifests.flatMap(({ browser, violations: items }) =>
    items.map((message) => `${browser}: ${message}`)),
  ...forbiddenCalls.map(({ api, file, line }) => `${file}:${line}: forbidden ${api}`),
  ...unexpectedNetworkCalls.map(({ file, kind, line }) =>
    `${file}:${line}: unexpected network call ${kind}`),
  ...missingNetworkCalls.map((call) => `missing expected network call ${call}`),
  ...unexpectedRemoteUrls.map(({ file, line, value }) =>
    `${file}:${line}: unexpected remote URL ${value}`),
  ...storageViolations,
];

const report = {
  audit: 'M7.1 permissions, storage, and runtime network static boundary',
  manifests,
  network: {
    allowedCalls: networkCalls,
    forbiddenCalls,
    remoteUrlLiterals,
  },
  passed: violations.length === 0,
  storage,
  violations,
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (violations.length > 0) process.exitCode = 1;
