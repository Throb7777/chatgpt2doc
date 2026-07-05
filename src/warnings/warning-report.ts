import type {
  DocumentWarning,
  WarningCode,
  WarningProvenance,
} from '../document/ast';

export interface WarningSummary {
  code: WarningCode;
  count: number;
  message: string;
  provenance: WarningProvenance[];
}

function warningKey(warning: DocumentWarning): string {
  return JSON.stringify({
    code: warning.code,
    message: warning.message,
    sourceKind: warning.provenance.sourceKind,
    stage: warning.provenance.stage,
  });
}

export function aggregateWarnings(
  warnings: readonly DocumentWarning[],
): WarningSummary[] {
  const summaries = new Map<string, WarningSummary>();
  for (const warning of warnings) {
    const key = warningKey(warning);
    const existing = summaries.get(key);
    if (existing) {
      existing.count += 1;
      existing.provenance.push(warning.provenance);
    } else {
      summaries.set(key, {
        code: warning.code,
        count: 1,
        message: warning.message,
        provenance: [warning.provenance],
      });
    }
  }
  return [...summaries.values()].sort((left, right) => (
    left.code.localeCompare(right.code) || left.message.localeCompare(right.message)
  ));
}
