export interface BlobDownloadAdapter {
  createObjectUrl(blob: Blob): string;
  defer(callback: () => void): void;
  revokeObjectUrl(url: string): void;
  trigger(url: string, fileName: string): void;
}

const WINDOWS_RESERVED_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const INVALID_WINDOWS_CHARACTER = /[<>:"/\\|?*]/gu;
const MAX_FILE_NAME_LENGTH = 180;

function createBrowserDownloadAdapter(): BlobDownloadAdapter {
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    defer: (callback) => globalThis.setTimeout(callback, 0),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    trigger: (url, fileName) => {
      const anchor = document.createElement('a');
      anchor.download = fileName;
      anchor.href = url;
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    },
  };
}

export function ensureFileExtension(fileName: string, extension: string): string {
  const trimmed = fileName.trim();
  const base = trimmed || 'chat-export';
  return base.toLowerCase().endsWith(extension.toLowerCase())
    ? base
    : `${base}${extension}`;
}

function timestamp(date: Date): string {
  const part = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    part(date.getMonth() + 1),
    part(date.getDate()),
  ].join('-') + '_' + [
    part(date.getHours()),
    part(date.getMinutes()),
    part(date.getSeconds()),
  ].join('-');
}

export function sanitizeWindowsFileName(
  value: string,
  fallback = 'chat-export',
): string {
  const withoutControlCharacters = Array.from(value, (character) => (
    (character.codePointAt(0) ?? 0) <= 0x1f ? ' ' : character
  )).join('');
  const normalized = withoutControlCharacters
    .replace(INVALID_WINDOWS_CHARACTER, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/gu, '');
  const safe = normalized || fallback;
  return WINDOWS_RESERVED_NAME.test(safe) ? `_${safe}` : safe;
}

export function createExportFileName(options: {
  exportedAt: Date;
  format: 'docx' | 'pdf';
  preferredName?: string;
  title: string;
}): string {
  const extension = `.${options.format}`;
  const preferred = options.preferredName?.trim();
  const source = preferred || `${options.title} ${timestamp(options.exportedAt)}`;
  const withoutExtension = source.toLowerCase().endsWith(extension)
    ? source.slice(0, -extension.length)
    : source;
  const maximumBaseLength = MAX_FILE_NAME_LENGTH - extension.length;
  const base = sanitizeWindowsFileName(withoutExtension)
    .slice(0, maximumBaseLength)
    .replace(/[. ]+$/gu, '') || 'chat-export';
  return `${base}${extension}`;
}

export class DownloadNameRegistry {
  private readonly counts = new Map<string, number>();

  reserve(fileName: string): string {
    const normalized = fileName.toLocaleLowerCase();
    const count = (this.counts.get(normalized) ?? 0) + 1;
    this.counts.set(normalized, count);
    if (count === 1) return fileName;
    const dot = fileName.lastIndexOf('.');
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    const extension = dot > 0 ? fileName.slice(dot) : '';
    const suffix = ` (${count})`;
    const maximumBaseLength = MAX_FILE_NAME_LENGTH - extension.length - suffix.length;
    return `${base.slice(0, maximumBaseLength).replace(/[. ]+$/gu, '')}${suffix}${extension}`;
  }
}

export function downloadBlob(
  blob: Blob,
  fileName: string,
  adapter: BlobDownloadAdapter = createBrowserDownloadAdapter(),
): void {
  const url = adapter.createObjectUrl(blob);
  adapter.trigger(url, fileName);
  adapter.defer(() => adapter.revokeObjectUrl(url));
}
