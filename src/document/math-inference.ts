import type { InlineNode, MathInlineNode, TextNode } from './ast';

export interface InferredMathSpan {
  end: number;
  node: MathInlineNode;
  start: number;
}

const CANDIDATE_PATTERN = /[A-Za-z0-9_^\p{Script=Greek}()[\]{},+\-\u2212\u00b1\u00d7\u00f7/=\u2208\u2209\u2229\u222a\u2264\u2265\u2260\u2248\u2261\u2282\u2286\u2283\u2287\u2192\u2190\u2194\u2191\u2193]+/gu;
const TAU_INTERVAL_PATTERN = /τ[\s\u00a0\u200b\u200c\u200d]*∈[\s\u00a0\u200b\u200c\u200d]*\[[\s\u00a0\u200b\u200c\u200d]*0[\s\u00a0\u200b\u200c\u200d]*,[\s\u00a0\u200b\u200c\u200d]*H[\s\u00a0\u200b\u200c\u200d]*\]/gu;
const TEX_CANDIDATE_PATTERN = /\\[A-Za-z]+(?:\{[^{}\s]+\})?(?:[_^](?:\{\\?[A-Za-z0-9]+\}|\\?[A-Za-z0-9]+))*/gu;
const STRONG_OPERATOR_PATTERN = /[\u2208\u2209\u2229\u222a\u2264\u2265\u2260\u2248\u2261\u2282\u2286\u2283\u2287\u2192\u2190\u2194\u2191\u2193]/u;
const GREEK_PATTERN = /\p{Script=Greek}/u;
const IDENTIFIER_PATTERN = /[A-Za-z\p{Script=Greek}]/u;
const STANDALONE_PATH_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\/[A-Za-z][A-Za-z0-9_]*(?:\([A-Za-z0-9_,]*\))?){2,}$/u;

function balanced(value: string): boolean {
  const expected: string[] = [];
  const pairs: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };
  for (const character of value) {
    if (character in pairs) {
      expected.push(pairs[character]!);
    } else if (character === ')' || character === ']' || character === '}') {
      if (expected.pop() !== character) return false;
    }
  }
  return expected.length === 0;
}

function inferredSource(value: string): string {
  return value
    .replace(/[\s\u00a0\u200b\u200c\u200d]+/gu, '')
    .replace(/_([A-Za-z]{2,})/gu, '_{$1}');
}

function isStrongCandidate(value: string, standalone: boolean): boolean {
  if (value.length < 3 || value.length > 80 || !balanced(value)) return false;
  if (!IDENTIFIER_PATTERN.test(value)) return false;
  if (/^(?:https?|www)$/iu.test(value) || value.includes('//')) return false;
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/u.test(value)) return false;

  const hasStrongOperator = STRONG_OPERATOR_PATTERN.test(value);
  const hasGreek = GREEK_PATTERN.test(value);
  const hasScript = /[_^][A-Za-z0-9{\p{Script=Greek}]/u.test(value);
  const hasRelation = value.includes('=');
  const hasGrouping = /[()[\]{}]/u.test(value);

  if (hasStrongOperator && (hasGreek || hasScript || hasRelation || hasGrouping)) return true;
  if (hasGreek && (hasRelation || hasGrouping)) return true;
  if (hasScript && hasRelation) return true;
  if (standalone && hasScript) return true;
  return standalone
    && STANDALONE_PATH_PATTERN.test(value)
    && hasScript
    && hasGrouping;
}

function normalizedText(value: string): TextNode | null {
  const normalized = value.replace(/\s+/gu, ' ');
  return normalized ? { kind: 'text', value: normalized } : null;
}

function inferredMath(value: string): MathInlineNode {
  return {
    fallbackText: value,
    kind: 'mathInline',
    provenance: 'inferred',
    source: inferredSource(value),
    sourceFormat: 'tex',
  };
}

export function splitInferredMath(value: string, standalone = false): InlineNode[] {
  const output: InlineNode[] = [];
  let offset = 0;
  const spans = inferMathSpans(value, standalone);

  for (const span of spans) {
    const before = normalizedText(value.slice(offset, span.start));
    if (before) output.push(before);
    output.push(span.node);
    offset = span.end;
  }

  if (output.length === 0) {
    const text = normalizedText(value);
    return text ? [text] : [];
  }
  const after = normalizedText(value.slice(offset));
  if (after) output.push(after);
  return output;
}

export function inferMathSpans(value: string, standalone = false): InferredMathSpan[] {
  const spans: InferredMathSpan[] = [];
  for (const match of value.matchAll(TAU_INTERVAL_PATTERN)) {
    const candidate = match[0];
    const index = match.index;
    spans.push({
      end: index + candidate.length,
      node: inferredMath(candidate),
      start: index,
    });
  }
  for (const match of value.matchAll(CANDIDATE_PATTERN)) {
    const candidate = match[0];
    const index = match.index;
    const end = index + candidate.length;
    if (spans.some((span) => index < span.end && end > span.start)) continue;
    if (!isStrongCandidate(candidate, standalone && value.trim() === candidate)) continue;
    spans.push({
      end,
      node: inferredMath(candidate),
      start: index,
    });
  }
  return spans.sort((left, right) => left.start - right.start);
}

export function inferTextFigureMathSpans(value: string): InferredMathSpan[] {
  const spans: InferredMathSpan[] = [];
  for (const match of value.matchAll(TEX_CANDIDATE_PATTERN)) {
    const candidate = match[0];
    const index = match.index;
    spans.push({
      end: index + candidate.length,
      node: inferredMath(candidate),
      start: index,
    });
  }
  for (const match of value.matchAll(CANDIDATE_PATTERN)) {
    const candidate = match[0];
    const index = match.index;
    const end = index + candidate.length;
    if (spans.some((span) => index < span.end && end > span.start)) continue;
    if (!isStrongCandidate(candidate, true)) continue;
    spans.push({
      end,
      node: inferredMath(candidate),
      start: index,
    });
  }
  return spans.sort((left, right) => left.start - right.start);
}

export function shouldPromoteInferredMathBlock(node: MathInlineNode): boolean {
  if (node.provenance !== 'inferred') return false;
  return /[\u2190-\u21ff]/u.test(node.fallbackText) && node.fallbackText.includes('=');
}
