import {
  BuilderElement,
  Math as WordMath,
  type MathComponent,
  MathCurlyBrackets,
  MathFraction,
  MathRadical,
  MathRoundBrackets,
  MathRun,
  MathSquareBrackets,
  MathSubScript,
  MathSubSuperScript,
  MathSuperScript,
  type XmlComponent,
} from 'docx';

import {
  type MathExpression,
  type MathExpressionSource,
  parseMathExpression,
  parseMathNodeExpression,
} from '../math/math-expression';

function matrixComponent(
  rows: MathExpression[][],
  options: WordMathRenderOptions,
): MathComponent {
  const rowElements = rows.map((row) => new BuilderElement({
    children: row.map((cell) => new BuilderElement({
      children: components(cell, options) as XmlComponent[],
      name: 'm:e',
    })),
    name: 'm:mr',
  }));
  return new BuilderElement({ children: rowElements, name: 'm:m' }) as unknown as MathComponent;
}

function mathPr(name: string, value: string): XmlComponent {
  return new BuilderElement<{ val: string }>({
    attributes: { val: { key: 'm:val', value } },
    name,
  });
}

export interface WordMathRenderOptions {
  profile?: 'default' | 'wps-clipboard';
}

function shouldUsePlainWpsMathStyle(value: string): boolean {
  const characters = [...value.trim()];
  return characters.length !== 1 || !/^\p{L}$/u.test(characters[0] ?? '');
}

function mathRun(
  value: string,
  options: WordMathRenderOptions,
): MathRun {
  const run = new MathRun(value);
  if (options.profile !== 'wps-clipboard') return run;

  const properties: XmlComponent[] = [];
  if (shouldUsePlainWpsMathStyle(value)) {
    properties.push(new BuilderElement({
      children: [mathPr('m:sty', 'p')],
      name: 'm:rPr',
    }));
  }
  properties.push(new BuilderElement({
    children: [new BuilderElement({
      attributes: {
        ascii: { key: 'w:ascii', value: 'Cambria Math' },
        cs: { key: 'w:cs', value: 'Cambria Math' },
        eastAsia: { key: 'w:eastAsia', value: 'Microsoft YaHei' },
        hAnsi: { key: 'w:hAnsi', value: 'Cambria Math' },
      },
      name: 'w:rFonts',
    })],
    name: 'w:rPr',
  }));
  const root = (run as unknown as { root: XmlComponent[] }).root;
  root.unshift(...properties);
  return run;
}

function wpsCasesDelimiter(
  matrix: Extract<MathExpression, { kind: 'matrix' }>,
  options: WordMathRenderOptions,
): MathComponent {
  return new BuilderElement({
    children: [
      new BuilderElement({
        children: [
          mathPr('m:begChr', '{'),
          mathPr('m:endChr', ''),
        ],
        name: 'm:dPr',
      }),
      new BuilderElement({
        children: components(matrix, options) as XmlComponent[],
        name: 'm:e',
      }),
    ],
    name: 'm:d',
  }) as unknown as MathComponent;
}

function mathSlot(
  name: string,
  expression: MathExpression | undefined,
  options: WordMathRenderOptions,
): XmlComponent | undefined {
  return expression
    ? new BuilderElement({
      children: components(expression, options) as XmlComponent[],
      name,
    })
    : undefined;
}

function accentCharacter(accent: Extract<MathExpression, { kind: 'accent' }>['accent']): string {
  switch (accent) {
    case 'bar':
      return '\u0305';
    case 'ddot':
      return '\u0308';
    case 'dot':
      return '\u0307';
    case 'tilde':
      return '\u0303';
    case 'hat':
      return '\u0302';
    default:
      return accent satisfies never;
  }
}

function naryOperatorCharacter(operator: Extract<MathExpression, { kind: 'nary' }>['operator']): string {
  switch (operator) {
    case 'sum':
      return '∑';
    case 'product':
      return '∏';
    case 'integral':
      return '∫';
    default:
      return operator;
  }
}

function naryComponents(
  expression: Extract<MathExpression, { kind: 'nary' }>,
  options: WordMathRenderOptions,
): MathComponent[] {
  if (
    expression.operator === 'arg'
    || expression.operator === 'max'
    || expression.operator === 'min'
    || expression.operator === 'sup'
  ) {
    const operator = new BuilderElement({
      children: [mathRun(expression.operator, options)],
      name: 'm:e',
    });
    const lower = mathSlot('m:lim', expression.lower, options);
    const upper = mathSlot('m:lim', expression.upper, options);
    const limitOperator = lower
      ? new BuilderElement({
        children: [operator, lower],
        name: 'm:limLow',
      })
      : upper
        ? new BuilderElement({
          children: [operator, upper],
          name: 'm:limUpp',
      })
      : operator;
    return [
      limitOperator as unknown as MathComponent,
      ...components(expression.body, options),
    ];
  }

  const slots = [
    mathSlot('m:sub', expression.lower, options),
    mathSlot('m:sup', expression.upper, options),
    new BuilderElement({
      children: components(expression.body, options) as XmlComponent[],
      name: 'm:e',
    }),
  ].filter((slot): slot is XmlComponent => Boolean(slot));
  return [new BuilderElement({
    children: [
      new BuilderElement({
        children: [
          mathPr('m:chr', naryOperatorCharacter(expression.operator)),
          mathPr('m:limLoc', expression.operator === 'integral' ? 'subSup' : 'undOvr'),
        ],
        name: 'm:naryPr',
      }),
      ...slots,
    ],
    name: 'm:nary',
  }) as unknown as MathComponent];
}

function components(
  expression: MathExpression,
  options: WordMathRenderOptions = {},
): MathComponent[] {
  switch (expression.kind) {
    case 'accent':
      return [new BuilderElement({
        children: [
          new BuilderElement({
            children: [new BuilderElement<{ val: string }>({
              attributes: { val: { key: 'm:val', value: accentCharacter(expression.accent) } },
              name: 'm:chr',
            })],
            name: 'm:accPr',
          }),
          new BuilderElement({
            children: components(expression.value, options) as XmlComponent[],
            name: 'm:e',
          }),
        ],
        name: 'm:acc',
      }) as unknown as MathComponent];
    case 'boxed':
      return [new BuilderElement({
        children: [
          new BuilderElement({
            children: components(expression.children, options) as XmlComponent[],
            name: 'm:e',
          }),
        ],
        name: 'm:borderBox',
      }) as unknown as MathComponent];
    case 'text':
      return expression.value ? [mathRun(expression.value, options)] : [];
    case 'sequence': {
      const rendered: MathComponent[] = [];
      for (let index = 0; index < expression.children.length; index += 1) {
        const child = expression.children[index]!;
        const next = expression.children[index + 1];
        if (
          options.profile === 'wps-clipboard'
          && child.kind === 'text'
          && child.value === '{'
          && next?.kind === 'matrix'
        ) {
          rendered.push(wpsCasesDelimiter(next, options));
          index += 1;
          continue;
        }
        rendered.push(...components(child, options));
      }
      return rendered;
    }
    case 'fraction':
      return [new MathFraction({
        denominator: components(expression.denominator, options),
        numerator: components(expression.numerator, options),
      })];
    case 'radical':
      return [new MathRadical({
        children: components(expression.value, options),
        degree: expression.degree ? components(expression.degree, options) : undefined,
      })];
    case 'script': {
      const scriptOptions = { children: components(expression.base, options) };
      if (expression.sub && expression.sup) {
        return [new MathSubSuperScript({
          ...scriptOptions,
          subScript: components(expression.sub, options),
          superScript: components(expression.sup, options),
        })];
      }
      if (expression.sub) return [new MathSubScript({
        ...scriptOptions,
        subScript: components(expression.sub, options),
      })];
      if (expression.sup) return [new MathSuperScript({
        ...scriptOptions,
        superScript: components(expression.sup, options),
      })];
      return scriptOptions.children;
    }
    case 'nary': {
      return naryComponents(expression, options);
    }
    case 'matrix':
      return [matrixComponent(expression.rows, options)];
    case 'delimiter': {
      if (expression.delimiter === 'norm' || expression.delimiter === 'absolute') {
        const character = expression.delimiter === 'norm' ? '∥' : '|';
        return [
          mathRun(character, options),
          ...components(expression.children, options),
          mathRun(character, options),
        ];
      }
      const bracketOptions = { children: components(expression.children, options) };
      return [expression.delimiter === 'round'
        ? new MathRoundBrackets(bracketOptions)
        : expression.delimiter === 'square'
          ? new MathSquareBrackets(bracketOptions)
          : new MathCurlyBrackets(bracketOptions)];
    }
    default:
      return expression satisfies never;
  }
}

export function createEditableWordMath(
  source: string,
  format: 'mathml' | 'tex',
  parseXml?: (source: string) => Document,
  options: WordMathRenderOptions = {},
): WordMath | undefined {
  try {
    const children = components(parseMathExpression(source, format, {
      ...(parseXml ? { parseMathMl: parseXml } : {}),
    }), options);
    return children.length > 0 ? new WordMath({ children }) : undefined;
  } catch {
    return undefined;
  }
}

export function createEditableWordMathFromNode(
  node: MathExpressionSource,
  parseXml?: (source: string) => Document,
  options: WordMathRenderOptions = {},
): WordMath | undefined {
  try {
    const children = components(parseMathNodeExpression(node, {
      ...(parseXml ? { parseMathMl: parseXml } : {}),
    }), options);
    return children.length > 0 ? new WordMath({ children }) : undefined;
  } catch {
    return undefined;
  }
}

export function createEditableWordMathParagraph(
  source: string,
  format: 'mathml' | 'tex',
  parseXml?: (source: string) => Document,
  options: WordMathRenderOptions = {},
): XmlComponent | undefined {
  const math = createEditableWordMath(source, format, parseXml, options);
  return math
    ? new BuilderElement({ children: [math], name: 'm:oMathPara' })
    : undefined;
}

export function createEditableWordMathParagraphFromNode(
  node: MathExpressionSource,
  parseXml?: (source: string) => Document,
  options: WordMathRenderOptions = {},
): XmlComponent | undefined {
  const math = createEditableWordMathFromNode(node, parseXml, options);
  return math
    ? new BuilderElement({ children: [math], name: 'm:oMathPara' })
    : undefined;
}
