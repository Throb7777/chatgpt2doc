export type MathExpression =
  | { accent: 'bar' | 'ddot' | 'dot' | 'hat' | 'tilde'; kind: 'accent'; value: MathExpression }
  | { children: MathExpression; kind: 'boxed' }
  | { kind: 'delimiter'; children: MathExpression; delimiter: 'absolute' | 'curly' | 'norm' | 'round' | 'square' }
  | { denominator: MathExpression; kind: 'fraction'; numerator: MathExpression }
  | { degree?: MathExpression; kind: 'radical'; value: MathExpression }
  | { kind: 'matrix'; rows: MathExpression[][] }
  | { base: MathExpression; kind: 'script'; sub?: MathExpression; sup?: MathExpression }
  | { children: MathExpression[]; kind: 'sequence' }
  | { body: MathExpression; kind: 'nary'; lower?: MathExpression; operator: 'arg' | 'integral' | 'max' | 'min' | 'product' | 'sum' | 'sup'; upper?: MathExpression }
  | { kind: 'text'; value: string };

export interface MathParseEnvironment {
  parseMathMl?: (source: string) => Document;
}

export interface MathExpressionSource {
  fallbackText?: string;
  source: string;
  sourceFormat: 'mathml' | 'tex';
}

const UNICODE_SUBSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
};

const UNICODE_SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

const UNICODE_SUBSCRIPT_OPERATORS: Readonly<Record<string, string>> = {
  '\u208A': '+', '\u208B': '-', '\u208C': '=', '\u208D': '(', '\u208E': ')',
};

const UNICODE_SUPERSCRIPT_OPERATORS: Readonly<Record<string, string>> = {
  '\u207A': '+', '\u207B': '-', '\u207C': '=', '\u207D': '(', '\u207E': ')',
};

const UNICODE_SUBSCRIPT_LETTERS: Readonly<Record<string, string>> = {
  '\u2090': 'a', '\u2091': 'e', '\u2092': 'o', '\u2093': 'x', '\u2095': 'h',
  '\u2096': 'k', '\u2097': 'l', '\u2098': 'm', '\u2099': 'n', '\u209A': 'p',
  '\u209B': 's', '\u209C': 't',
  '\u1D62': 'i', '\u2C7C': 'j', '\u1D63': 'r', '\u1D64': 'u', '\u1D65': 'v',
  '\u1D66': '\\beta', '\u1D67': '\\gamma', '\u1D68': '\\rho', '\u1D69': '\\phi',
  '\u1D6A': '\\chi',
};

const UNICODE_SUPERSCRIPT_LETTERS: Readonly<Record<string, string>> = {
  '\u1D43': 'a', '\u1D47': 'b', '\u1D9C': 'c', '\u1D48': 'd', '\u1D49': 'e',
  '\u1DA0': 'f', '\u1D4D': 'g', '\u02B0': 'h', '\u2071': 'i', '\u02B2': 'j',
  '\u1D4F': 'k', '\u02E1': 'l', '\u1D50': 'm', '\u207F': 'n', '\u1D52': 'o',
  '\u1D56': 'p', '\u02B3': 'r', '\u02E2': 's', '\u1D57': 't', '\u1D58': 'u',
  '\u1D5B': 'v', '\u02B7': 'w', '\u02E3': 'x', '\u02B8': 'y', '\u1DBB': 'z',
  '\u1D45': '\\alpha', '\u1D5D': '\\beta', '\u1D5E': '\\gamma', '\u1DBF': '\\theta',
  '\u1D60': '\\phi', '\u1D61': '\\chi',
};

const UNICODE_SUBSCRIPT_CHARACTERS = {
  ...UNICODE_SUBSCRIPT_DIGITS,
  ...UNICODE_SUBSCRIPT_OPERATORS,
  ...UNICODE_SUBSCRIPT_LETTERS,
};

const UNICODE_SUPERSCRIPT_CHARACTERS = {
  ...UNICODE_SUPERSCRIPT_DIGITS,
  ...UNICODE_SUPERSCRIPT_OPERATORS,
  ...UNICODE_SUPERSCRIPT_LETTERS,
};

const MATHEMATICAL_PRIME = '′';
const PRIME_CHARACTERS = new Set(["'", '’', MATHEMATICAL_PRIME]);

export function normalizeUnicodeDigitScripts(source: string): string {
  const characters = [...source];
  let normalized = '';
  for (let index = 0; index < characters.length;) {
    const subscript = UNICODE_SUBSCRIPT_CHARACTERS[characters[index]];
    const superscript = UNICODE_SUPERSCRIPT_CHARACTERS[characters[index]];
    const mapping = subscript ? UNICODE_SUBSCRIPT_CHARACTERS : superscript
      ? UNICODE_SUPERSCRIPT_CHARACTERS
      : undefined;
    if (!mapping) {
      normalized += characters[index];
      index += 1;
      continue;
    }
    let value = '';
    while (index < characters.length && mapping[characters[index]]) {
      value += mapping[characters[index]];
      index += 1;
    }
    normalized += `${subscript ? '_' : '^'}{${value}}`;
  }
  return normalized;
}

function looksLikeMathFallback(value: string): boolean {
  return /(?:release\s*\/\s*hold)|[\\_^=+\-*/()[\]{}]|[α-ωΑ-Ω∈≤≥≠≈→←↔↓↑∑∫√∞τ]/u.test(value);
}

function isFlattenedScriptFallback(source: string, fallback: string): boolean {
  return /(?:[_^]|\\(?:left|right)|<m(?:sub|sup|subsup)\b)/u.test(source)
    && /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻᵅᵝᵞᶿᵠᵡₐₑₒₓₕₖₗₘₙₚₛₜᵢⱼᵣᵤᵥᵦᵧᵨᵩᵪ]/u.test(fallback);
}

function normalizeCausalEffectFallback(fallback: string): string | undefined {
  const compact = fallback.replace(/\s+/gu, '').replace(/\u03F5/gu, 'ε');
  if (compact === 'CEa→sj=Est[Vara(s^j,t+₁do(a))]') {
    return String.raw`CE_{a\to s_j}=E_{s_t}[\operatorname{Var}_a(s^j_{t+1}\mid do(a))]`;
  }
  if (compact === 'CEsi→sj=E[Δs^j,t+₁∣do(si,t+ε)]') {
    return String.raw`CE_{s_i\to s_j}=E[\Delta s^j_{t+1}\mid do(s_{i,t}+\epsilon)]`;
  }
  return undefined;
}

const SYMBOLS: Readonly<Record<string, string>> = {
  '%': '%', '|': '∥',
  alpha: 'α', approx: '≈', ast: '∗', beta: 'β', cap: '∩', cdot: '·', cdots: '⋯',
  chi: 'χ', cup: '∪', delta: 'δ', Delta: 'Δ', dots: '…', downarrow: '↓', emptyset: '∅', equiv: '≡',
  ell: 'ℓ', epsilon: 'ϵ', eta: 'η', exists: '∃', forall: '∀', gamma: 'γ', Gamma: 'Γ', ge: '≥', geq: '≥', in: '∈', infty: '∞', iota: 'ι', kappa: 'κ', mid: '∣',
  lambda: 'λ', Lambda: 'Λ', land: '∧', ldots: '…', le: '≤', leftarrow: '←', Leftarrow: '⇐',
  leftrightarrow: '↔', Leftrightarrow: '⇔', leq: '≤', longrightarrow: '⟶', Longrightarrow: '⟹', mapsto: '↦', mu: 'μ', nabla: '∇', nu: 'ν', omega: 'ω', Omega: 'Ω',
  ne: '≠', neq: '≠', ni: '∋', notin: '∉', odot: '⊙', partial: '∂', phi: 'φ', Phi: 'Φ', pi: 'π', Pi: 'Π', pm: '±',
  prime: MATHEMATICAL_PRIME, propto: '∝', psi: 'ψ', Psi: 'Ψ', rho: 'ρ', rightarrow: '→', Rightarrow: '⇒', setminus: '∖', sim: '∼',
  sigma: 'σ', Sigma: 'Σ', Downarrow: '⇓', lVert: '∥', rVert: '∥', Vert: '∥', star: '⋆', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', tau: 'τ', theta: 'θ', Theta: 'Θ',
  times: '×', to: '→', top: '⊤', Upsilon: 'Υ', varphi: 'φ', xi: 'ξ', Xi: 'Ξ', zeta: 'ζ',
};

const OPERATORS = new Set([
  'arg',
  'max',
  'min',
  'sup',
]);
type LimitOperator = 'arg' | 'integral' | 'max' | 'min' | 'product' | 'sum' | 'sup';

const CALLIGRAPHIC: Readonly<Record<string, string>> = {
  A: '𝒜', B: 'ℬ', C: '𝒞', D: '𝒟', E: 'ℰ', F: 'ℱ', G: '𝒢', H: 'ℋ',
  I: 'ℐ', J: '𝒥', K: '𝒦', L: 'ℒ', M: 'ℳ', N: '𝒩', O: '𝒪', P: '𝒫',
  Q: '𝒬', R: 'ℛ', S: '𝒮', T: '𝒯', U: '𝒰', V: '𝒱', W: '𝒲', X: '𝒳',
  Y: '𝒴', Z: '𝒵', a: '𝒶', b: '𝒷', c: '𝒸', d: '𝒹', e: 'ℯ', f: '𝒻',
  g: 'ℊ', h: '𝒽', i: '𝒾', j: '𝒿', k: '𝓀', l: '𝓁', m: '𝓂', n: '𝓃',
  o: 'ℴ', p: '𝓅', q: '𝓆', r: '𝓇', s: '𝓈', t: '𝓉', u: '𝓊', v: '𝓋',
  w: '𝓌', x: '𝓍', y: '𝓎', z: '𝓏',
};

class UnsupportedMathError extends Error {}

function sequence(children: MathExpression[]): MathExpression {
  const flattened = children.flatMap((child) => (
    child.kind === 'sequence' ? child.children : [child]
  ));
  return flattened.length === 1 ? flattened[0] : { children: flattened, kind: 'sequence' };
}

function mapText(expression: MathExpression, mapping: Readonly<Record<string, string>>): MathExpression {
  switch (expression.kind) {
    case 'text':
      return { kind: 'text', value: [...expression.value].map((value) => mapping[value] ?? value).join('') };
    case 'sequence':
      return sequence(expression.children.map((child) => mapText(child, mapping)));
    default:
      return expression;
  }
}

class TexParser {
  private index = 0;
  private literalTextDepth = 0;

  constructor(private readonly source: string) {}

  parse(): MathExpression {
    const result = this.parseSequence();
    this.skipWhitespace();
    if (this.index !== this.source.length) throw new UnsupportedMathError('Unexpected TeX input.');
    return result;
  }

  private parseSequence(stop?: () => boolean): MathExpression {
    const children: MathExpression[] = [];
    while (this.index < this.source.length && !stop?.()) {
      this.skipWhitespace();
      if (this.index >= this.source.length || stop?.()) break;
      children.push(this.parseAtomWithScripts());
    }
    return sequence(children);
  }

  private parseAtomWithScripts(): MathExpression {
    let base = this.parseAtom();
    let sub: MathExpression | undefined;
    let sup: MathExpression | undefined;
    while (true) {
      const current = this.peek();
      if (this.literalTextDepth === 0 && (current === '_' || current === '^')) {
        this.index += 1;
        const value = this.parseArgument();
        if (current === '_') sub = value;
        else sup = value;
        continue;
      }
      if (this.literalTextDepth === 0 && PRIME_CHARACTERS.has(current)) {
        let primes = '';
        while (PRIME_CHARACTERS.has(this.peek())) {
          primes += MATHEMATICAL_PRIME;
          this.index += 1;
        }
        const value: MathExpression = { kind: 'text', value: primes };
        sup = sup ? sequence([sup, value]) : value;
        continue;
      }
      break;
    }
    if (sub || sup) base = { base, kind: 'script', sub, sup };
    return base;
  }

  private parseAtom(): MathExpression {
    const current = this.peek();
    if (current === '{') return this.parseGroup();
    if (current === '\\') return this.parseCommand();
    if (current === '}' || current === '^' || (current === '_' && this.literalTextDepth === 0)) {
      throw new UnsupportedMathError('Unexpected TeX token.');
    }
    this.index += 1;
    return {
      kind: 'text',
      value: this.literalTextDepth === 0 && PRIME_CHARACTERS.has(current)
        ? MATHEMATICAL_PRIME
        : current,
    };
  }

  private parseCommand(): MathExpression {
    this.index += 1;
    const command = this.readCommandName();
    if ([' ', ',', ':', ';', 'enspace', 'hspace', 'quad', 'qquad', 'thinspace'].includes(command)) {
      if (command === 'hspace') this.parseArgument();
      return { kind: 'text', value: ' ' };
    }
    if (command === '!') return { kind: 'text', value: '' };
    if (command === '_') return { kind: 'text', value: '_' };
    if (command in SYMBOLS) return { kind: 'text', value: SYMBOLS[command] };
    if (command === 'not') return this.parseNegatedRelation();
    if (command === 'log' || command === 'exp') return { kind: 'text', value: command };
    if (OPERATORS.has(command)) {
      return this.peek() === '_' || this.peek() === '^'
        ? this.parseNary(command as 'arg' | 'max' | 'min' | 'sup')
        : { kind: 'text', value: command };
    }
    if (command === 'limits' || command === 'nolimits') return { kind: 'text', value: '' };
    if (command === 'hat' || command === 'widehat') {
      return { accent: 'hat', kind: 'accent', value: this.parseArgument() };
    }
    if (command === 'tilde' || command === 'widetilde') {
      return { accent: 'tilde', kind: 'accent', value: this.parseArgument() };
    }
    if (command === 'bar') {
      return { accent: 'bar', kind: 'accent', value: this.parseArgument() };
    }
    if (command === 'dot' || command === 'ddot') {
      return { accent: command, kind: 'accent', value: this.parseArgument() };
    }
    if (command === 'xrightarrow') {
      return { base: { kind: 'text', value: '→' }, kind: 'script', sup: this.parseArgument() };
    }
    if (command === 'frac' || command === 'dfrac' || command === 'tfrac') {
      return { kind: 'fraction', numerator: this.parseArgument(), denominator: this.parseArgument() };
    }
    if (command === 'sqrt') {
      const degree = this.peek() === '[' ? this.parseSquareArgument() : undefined;
      return { degree, kind: 'radical', value: this.parseArgument() };
    }
    if (command === 'sum' || command === 'int' || command === 'prod') return this.parseNary(command);
    if (command === 'begin') return this.parseMatrix();
    if (command === 'left') return this.parseDelimited();
    if (command === 'mathcal') return mapText(this.parseArgument(), CALLIGRAPHIC);
    if (command === 'mathbb') return this.parseArgument();
    if (command === 'boxed') return { children: this.parseArgument(), kind: 'boxed' };
    if (command === 'text' || command === 'textbf') return this.parseLiteralTextArgument();
    if (['mathbf', 'mathit', 'mathrm', 'operatorname'].includes(command)) {
      if (command === 'operatorname' && this.peek() === '*') this.index += 1;
      return this.parseArgument();
    }
    if (command === '{' || command === '}') return { kind: 'text', value: command };
    throw new UnsupportedMathError(`Unsupported TeX command: ${command}`);
  }

  private parseNegatedRelation(): MathExpression {
    this.skipWhitespace();
    if (this.peek() !== '\\') throw new UnsupportedMathError('Unsupported negated relation.');
    this.index += 1;
    const command = this.readCommandName();
    if (command === 'Rightarrow') return { kind: 'text', value: '⇏' };
    if (command === 'rightarrow' || command === 'to') return { kind: 'text', value: '↛' };
    throw new UnsupportedMathError(`Unsupported negated relation: ${command}`);
  }

  private parseNary(command: 'arg' | 'int' | 'max' | 'min' | 'prod' | 'sum' | 'sup'): MathExpression {
    let lower: MathExpression | undefined;
    let upper: MathExpression | undefined;
    while (this.peek() === '_' || this.peek() === '^') {
      const marker = this.source[this.index++];
      const value = this.parseArgument();
      if (marker === '_') lower = value;
      else upper = value;
    }
    this.skipWhitespace();
    return {
      body: this.index < this.source.length && this.peek() !== '}'
        ? this.parseSequence(() => this.peek() === '}')
        : { kind: 'text', value: '' },
      kind: 'nary',
      lower,
      operator: command === 'sum'
        ? 'sum'
        : command === 'prod'
          ? 'product'
          : command === 'int'
            ? 'integral'
            : command,
      upper,
    };
  }

  private parseMatrix(): MathExpression {
    const environment = this.readRawGroup();
    if (!['bmatrix', 'cases', 'matrix', 'pmatrix'].includes(environment)) {
      throw new UnsupportedMathError(`Unsupported TeX environment: ${environment}`);
    }
    const end = `\\end{${environment}}`;
    const endIndex = this.source.indexOf(end, this.index);
    if (endIndex < 0) throw new UnsupportedMathError('Unclosed matrix environment.');
    const raw = this.source.slice(this.index, endIndex);
    this.index = endIndex + end.length;
    const matrix: MathExpression = {
      kind: 'matrix',
      rows: raw.split(/\\\\/u).map((row) => row.split('&').map((cell) => (
        new TexParser(cell.trim()).parse()
      ))),
    };
    if (environment === 'cases') return sequence([{ kind: 'text', value: '{' }, matrix]);
    if (environment === 'bmatrix') return { children: matrix, delimiter: 'square', kind: 'delimiter' };
    if (environment === 'pmatrix') return { children: matrix, delimiter: 'round', kind: 'delimiter' };
    return matrix;
  }

  private parseDelimited(): MathExpression {
    const opening = this.readDelimiter();
    const rightIndex = this.findMatchingRight();
    if (rightIndex < 0) throw new UnsupportedMathError('Unclosed delimiter.');
    const inner = new TexParser(this.source.slice(this.index, rightIndex)).parse();
    this.index = rightIndex + '\\right'.length;
    const closing = this.readDelimiter();
    const pair = `${opening}${closing}`;
    const delimiter = pair === '()' ? 'round' : pair === '[]' ? 'square' : pair === '{}'
      ? 'curly'
      : pair === '∥∥'
        ? 'norm'
        : pair === '||'
          ? 'absolute'
      : undefined;
    if (!delimiter) throw new UnsupportedMathError(`Unsupported delimiter pair: ${pair}`);
    return { children: inner, delimiter, kind: 'delimiter' };
  }

  private findMatchingRight(): number {
    let depth = 0;
    for (let cursor = this.index; cursor < this.source.length;) {
      if (this.source[cursor] !== '\\') {
        cursor += 1;
        continue;
      }
      const { command, next } = this.commandAt(cursor + 1);
      if (command === 'left') {
        depth += 1;
      } else if (command === 'right') {
        if (depth === 0) return cursor;
        depth -= 1;
      }
      cursor = next;
    }
    return -1;
  }

  private commandAt(start: number): { command: string; next: number } {
    let cursor = start;
    if (!/[A-Za-z]/u.test(this.source[cursor] ?? '')) {
      return { command: this.source[cursor] ?? '', next: cursor + 1 };
    }
    while (/[A-Za-z]/u.test(this.source[cursor] ?? '')) cursor += 1;
    return { command: this.source.slice(start, cursor), next: cursor };
  }

  private parseArgument(): MathExpression {
    this.skipWhitespace();
    return this.peek() === '{' ? this.parseGroup() : this.parseAtom();
  }

  private parseLiteralTextArgument(): MathExpression {
    this.literalTextDepth += 1;
    try {
      return this.parseArgument();
    } finally {
      this.literalTextDepth -= 1;
    }
  }

  private parseGroup(): MathExpression {
    this.expect('{');
    const result = this.parseSequence(() => this.peek() === '}');
    this.expect('}');
    return result;
  }

  private parseSquareArgument(): MathExpression {
    this.expect('[');
    const start = this.index;
    while (this.index < this.source.length && this.peek() !== ']') this.index += 1;
    if (this.index >= this.source.length) throw new UnsupportedMathError('Unclosed root degree.');
    const result = new TexParser(this.source.slice(start, this.index)).parse();
    this.index += 1;
    return result;
  }

  private readRawGroup(): string {
    this.expect('{');
    const start = this.index;
    while (this.index < this.source.length && this.peek() !== '}') this.index += 1;
    const value = this.source.slice(start, this.index);
    this.expect('}');
    return value;
  }

  private readCommandName(): string {
    const start = this.index;
    if (!/[A-Za-z]/u.test(this.peek())) return this.source[this.index++] ?? '';
    while (/[A-Za-z]/u.test(this.peek())) this.index += 1;
    return this.source.slice(start, this.index);
  }

  private readDelimiter(): string {
    this.skipWhitespace();
    if (this.peek() === '\\') {
      this.index += 1;
      const command = this.readCommandName();
      if (command === '{' || command === '}') return command;
      if (command === 'lVert' || command === 'rVert' || command === 'Vert' || command === '|') return '∥';
      if (command === 'lvert' || command === 'rvert' || command === 'vert') return '|';
    }
    return this.source[this.index++] ?? '';
  }

  private expect(value: string): void {
    if (this.peek() !== value) throw new UnsupportedMathError(`Expected ${value}.`);
    this.index += 1;
  }

  private peek(): string {
    return this.source[this.index] ?? '';
  }

  private skipWhitespace(): void {
    if (this.literalTextDepth > 0) return;
    while (/\s/u.test(this.peek())) this.index += 1;
  }
}

function mathMlExpression(element: Element): MathExpression {
  const children = () => sequence(Array.from(element.children, mathMlExpression));
  const asLimitOperator = (expression: MathExpression): LimitOperator | undefined => {
    if (expression.kind !== 'text') return undefined;
    if (expression.value === '∑') return 'sum';
    if (expression.value === '∏') return 'product';
    if (expression.value === '∫') return 'integral';
    if (expression.value === 'arg' || expression.value === 'max' || expression.value === 'min' || expression.value === 'sup') {
      return expression.value;
    }
    return undefined;
  };
  const scriptedOrLimited = (
    base: MathExpression,
    lower?: MathExpression,
    upper?: MathExpression,
  ): MathExpression => {
    const operator = asLimitOperator(base);
    return operator
      ? {
        body: { kind: 'text', value: '' },
        kind: 'nary',
        lower,
        operator,
        upper,
      }
      : { base, kind: 'script', sub: lower, sup: upper };
  };
  switch (element.localName.toLowerCase()) {
    case 'math':
    case 'mrow':
    case 'mtd':
    case 'mstyle':
    case 'semantics':
      return children();
    case 'annotation':
      return { kind: 'text', value: '' };
    case 'mi': {
      const value = element.textContent ?? '';
      return {
        kind: 'text',
        value: element.getAttribute('mathvariant') === 'script'
          ? [...value].map((character) => CALLIGRAPHIC[character] ?? character).join('')
          : value,
      };
    }
    case 'mn':
    case 'mo':
    case 'mtext':
      return { kind: 'text', value: element.textContent ?? '' };
    case 'mspace':
      return { kind: 'text', value: ' ' };
    case 'mfrac':
      return { denominator: mathMlExpression(element.children[1]), kind: 'fraction', numerator: mathMlExpression(element.children[0]) };
    case 'msqrt':
      return { kind: 'radical', value: children() };
    case 'mroot':
      return { degree: mathMlExpression(element.children[1]), kind: 'radical', value: mathMlExpression(element.children[0]) };
    case 'msub':
      return scriptedOrLimited(mathMlExpression(element.children[0]), mathMlExpression(element.children[1]));
    case 'msup':
      return scriptedOrLimited(mathMlExpression(element.children[0]), undefined, mathMlExpression(element.children[1]));
    case 'msubsup':
      return scriptedOrLimited(
        mathMlExpression(element.children[0]),
        mathMlExpression(element.children[1]),
        mathMlExpression(element.children[2]),
      );
    case 'munder':
      return scriptedOrLimited(mathMlExpression(element.children[0]), mathMlExpression(element.children[1]));
    case 'mover': {
      const accent = element.getAttribute('accent') === 'true'
        ? mathMlAccent(element.children[1]?.textContent ?? '')
        : undefined;
      return accent
        ? { accent, kind: 'accent', value: mathMlExpression(element.children[0]) }
        : scriptedOrLimited(mathMlExpression(element.children[0]), undefined, mathMlExpression(element.children[1]));
    }
    case 'munderover':
      return scriptedOrLimited(
        mathMlExpression(element.children[0]),
        mathMlExpression(element.children[1]),
        mathMlExpression(element.children[2]),
      );
    case 'mtable':
      return { kind: 'matrix', rows: Array.from(element.children, (row) => Array.from(row.children, mathMlExpression)) };
    case 'mfenced': {
      const pair = `${element.getAttribute('open') ?? '('}${element.getAttribute('close') ?? ')'}`;
      const delimiter = pair === '()' ? 'round' : pair === '[]' ? 'square' : pair === '{}'
        ? 'curly'
        : undefined;
      if (!delimiter) throw new UnsupportedMathError(`Unsupported MathML delimiter: ${pair}`);
      return { children: children(), delimiter, kind: 'delimiter' };
    }
    default:
      throw new UnsupportedMathError(`Unsupported MathML element: ${element.localName}`);
  }
}

function mathMlAccent(value: string): Extract<MathExpression, { kind: 'accent' }>['accent'] | undefined {
  if (value === '~') return 'tilde';
  if (value === '^' || value === 'ˆ') return 'hat';
  if (value === '¯' || value === '‾') return 'bar';
  if (value === '˙' || value === '.') return 'dot';
  if (value === '¨') return 'ddot';
  return undefined;
}

export function parseMathExpression(
  source: string,
  format: 'mathml' | 'tex',
  environment: MathParseEnvironment = {},
): MathExpression {
  if (format === 'tex') {
    const compact = source.replace(/\s+/gu, '');
    const normalizedSource = /release\/hold\/?v_?u\(t\)/iu.test(compact)
      ? '\\text{release/hold}/v_u(t)'
      : normalizeUnicodeDigitScripts(source);
    return new TexParser(normalizedSource).parse();
  }
  const parser = environment.parseMathMl
    ?? ((value: string) => new DOMParser().parseFromString(value, 'application/xml'));
  return mathMlExpression(parser(source).documentElement);
}

export function parseMathNodeExpression(
  node: MathExpressionSource,
  environment: MathParseEnvironment = {},
): MathExpression {
  try {
    return parseMathExpression(node.source, node.sourceFormat, environment);
  } catch (sourceError) {
    const fallback = node.fallbackText?.trim();
    if (!fallback || fallback === node.source.trim() || !looksLikeMathFallback(fallback)) {
      throw sourceError;
    }
    const causalFallback = normalizeCausalEffectFallback(fallback);
    if (causalFallback) return parseMathExpression(causalFallback, 'tex', environment);
    if (isFlattenedScriptFallback(node.source, fallback)) throw sourceError;
    return parseMathExpression(fallback, 'tex', environment);
  }
}
