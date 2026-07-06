import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const root = process.cwd();
const hostPath = path.join(root, 'native', 'wps-helper', 'dist', 'ChatExportWpsHost.exe');
const packagePath = path.join(
  root,
  'docs',
  'qa-artifacts',
  'm16-1',
  'wps-native-equation-copy',
  '20260703',
  'project-generated-package.docx',
);
const clipboardEvidenceDirectory = path.join(
  root,
  'docs',
  'qa-artifacts',
  'm16-1',
  'word-safe-mode-manual',
  'fresh-enhanced-after-window-capture',
);

function frame(value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

function responseReader(stream) {
  let buffered = Buffer.alloc(0);
  const pending = [];
  stream.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 4) {
      const length = buffered.readUInt32LE(0);
      if (buffered.length < length + 4) break;
      const body = buffered.subarray(4, length + 4);
      buffered = buffered.subarray(length + 4);
      pending.shift()?.resolve(JSON.parse(body.toString('utf8')));
    }
  });
  return () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
}

const host = spawn(hostPath, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
const nextResponse = responseReader(host.stdout);
const pingResponse = nextResponse();
host.stdin.write(frame({ operation: 'ping' }));
const ping = await pingResponse;
if (!ping.ok || ping.protocolVersion !== 1 || !ping.wpsInstalled) {
  throw new Error(`Unexpected helper ping: ${JSON.stringify(ping)}`);
}

const diagnoseResponse = nextResponse();
host.stdin.write(frame({ operation: 'diagnose' }));
const diagnose = await diagnoseResponse;
if (
  !diagnose.ok
  || diagnose.protocolVersion !== 1
  || !diagnose.diagnostics
  || !Array.isArray(diagnose.diagnostics.allowedExtensionIds)
  || typeof diagnose.diagnostics.installPath !== 'string'
  || typeof diagnose.diagnostics.manifestPath !== 'string'
) {
  throw new Error(`Unexpected helper diagnose: ${JSON.stringify(diagnose)}`);
}

const rejectedResponse = nextResponse();
host.stdin.write(frame({ operation: 'unknown-operation' }));
const rejected = await rejectedResponse;
if (rejected.ok || rejected.error !== 'unsupported-operation') {
  throw new Error(`Unexpected allowlist response: ${JSON.stringify(rejected)}`);
}

const docx = await readFile(packagePath);
const html = await readFile(path.join(clipboardEvidenceDirectory, 'clipboard.html'), 'utf8');
const text = await readFile(path.join(clipboardEvidenceDirectory, 'clipboard.txt'), 'utf8');
const prepareResponse = nextResponse();
host.stdin.write(frame({
  operation: 'prepare-wps-clipboard',
  docxBase64: docx.toString('base64'),
  html,
  text,
}));
const prepared = await prepareResponse;
host.stdin.end();
if (!prepared.ok || prepared.packageBytes !== docx.length) {
  throw new Error(`Unexpected helper response: ${JSON.stringify(prepared)}`);
}

process.stdout.write(`${JSON.stringify({ ping, diagnose, rejected, prepared }, null, 2)}\n`);
