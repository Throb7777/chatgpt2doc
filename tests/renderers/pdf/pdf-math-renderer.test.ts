import { JSDOM } from 'jsdom';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';

import type { BlockNode, ChatDocument } from '../../../src/document/ast';
import type { ExportRequest } from '../../../src/document/export';
import { nodePdfFontEnvironment } from '../../../scripts/lib/node-pdf-font-environment';
import { REFERENCE_EXPORT_PROFILE } from '../../../src/renderers/export-layout-profile';
import { pdfHatAccentSegments } from '../../../src/renderers/pdf/pdf-math-renderer';
import { renderStructuredPdf } from '../../../src/renderers/pdf/pdf-node-renderer';

const fontEnvironment = nodePdfFontEnvironment;

function mathBlock(
  source: string,
  sourceFormat: 'mathml' | 'tex' = 'tex',
  fallbackText = source,
): BlockNode {
  return { fallbackText, kind: 'mathBlock', source, sourceFormat };
}

function request(content: BlockNode[]): ExportRequest {
  const document: ChatDocument = {
    version: 1,
    title: 'M5.3 Vector Math Fixture',
    source: {
      platform: 'chatgpt',
      url: 'https://chatgpt.com/c/m5-3-math',
      capturedAt: '2026-06-23T04:00:00.000Z',
    },
    exportedAt: '2026-06-23T04:01:00.000Z',
    messages: [{
      content,
      id: 'assistant-math',
      order: 0,
      role: 'assistant',
      selected: true,
      status: 'complete',
    }],
    warnings: [],
  };
  return {
    document,
    selection: { scope: 'full-conversation' },
    options: {
      codeStyle: 'document',
      fileName: 'm5-3-vector-math',
      format: 'pdf',
      includePrompts: true,
      language: 'en',
      paper: 'a4',
      theme: 'light',
    },
  };
}

const M16_COMPLEX_FORMULAS = [
  {
    fallbackText: 's^t+₁(a)=F(st,do(at=a))',
    source: String.raw`\hat{s}^{t+1}(a)=F(s_t,\mathrm{do}(a_t=a))`,
  },
  {
    fallbackText: 's^t+₁(a′)=F(st,do(at=a′))',
    source: String.raw`\hat{s}^{t+1}(a')=F(s_t,\mathrm{do}(a_t=a'))`,
  },
  {
    fallbackText: 'Δa,a′=s^t+₁(a)−s^t+₁(a′)',
    source: String.raw`\Delta_{a,a'}=\hat{s}^{t+1}(a)-\hat{s}^{t+1}(a')`,
  },
  {
    fallbackText: 's^t+₁(k),r^t+₁(k),o^t+₁(k)=Fθ(st,do(at=a(k)))',
    source: String.raw`\hat{s}^{t+1}(k),\hat{r}^{t+1}(k),\hat{o}^{t+1}(k)=F_\theta(s_t,\mathrm{do}(a_t=a(k)))`,
  },
  {
    fallbackText: 'a⋆=arg max aDpred(pG₁(st+₁∣st,a),pG₂(st+₁∣st,a))',
    source: String.raw`a^\star=\arg\max_a D_{pred}(p_{G_1}(s_{t+1}\mid s_t,a),p_{G_2}(s_{t+1}\mid s_t,a))`,
  },
  {
    fallbackText: 'Lint=∥o^t+₁do(a)−ot+₁real∥²+∥r^t+₁do(a)−rt+₁real∥²',
    source: String.raw`L_{int}=\left\lVert o^{t+1}_{do(a)}-o^{real}_{t+1}\right\rVert^2+\left\lVert r^{t+1}_{do(a)}-r^{real}_{t+1}\right\rVert^2`,
  },
  {
    fallbackText: 'Llatent-align=∥s^t+₁do(a)−st+₁post∥²',
    source: String.raw`L_{latent-align}=\left\lVert s^{t+1}_{do(a)}-s^{post}_{t+1}\right\rVert^2`,
  },
  {
    fallbackText: 'CEa→sj=Est[Vara(s^j,t+₁do(a))]',
    source: String.raw`CE_{a\to s_j}=\mathbb{E}_{s_t}[\operatorname{Var}_a(s^j_{t+1}^{do(a)})]`,
  },
  {
    fallbackText: 'CEsi→sj=E[Δs^j,t+₁∣do(si,t+ϵ)]',
    source: String.raw`CE_{s_i\to s_j}=E[\Delta s^j_{t+1}\mid do(s_{i,t}+\epsilon)]`,
  },
  {
    fallbackText: '动态代理：Zt−L:t,Ut→Zt+₁:t+H',
    source: String.raw`\textbf{动态代理：}\quad Z_{t-L:t},U_t\rightarrow Z_{t+1:t+H}`,
  },
] as const;

const M16_SOC_FORMULAS = [
  String.raw`\text{知识缺口}\longrightarrow\text{流畅补全}\longrightarrow\text{自信输出}`,
  String.raw`80\%`,
  String.raw`\|h-\hat{h}\|^2`,
  String.raw`L=\|h-\hat{h}\|^2+\lambda\|z\|_1.`,
  String.raw`p(x_{1:T})=\prod_{t=1}^{T}p(x_t\mid x_{<t}).`,
  String.raw`q\longrightarrow\begin{cases}\text{回答}, & \text{若模型知道}\\ \text{拒答}, & \text{若模型不知道}\end{cases}`,
  String.raw`\text{找到内部表征方向}\longrightarrow\text{推理时干预}\longrightarrow\text{改变输出行为}`,
  String.raw`\Downarrow`,
  String.raw`\text{问题}\longrightarrow\text{答案样文本}`,
  String.raw`\text{问题}\longrightarrow\text{先判断是否知道}\longrightarrow\text{回答或拒答}`,
  String.raw`\text{专门训练拒答/不确定表达}\Longrightarrow\text{可以部分缓解}`,
  String.raw`\text{语言上合理}\not\Rightarrow\text{事实中为真}`,
  String.raw`a\ast`,
  String.raw`\boxed{\text{可靠的大模型系统，不应该只是更会回答，而应该更会判断什么时候不该回答。}}`,
] as const;

async function inspect(blob: Blob): Promise<{ pageCount: number; text: string }> {
  const pdf = await getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    isEvalSupported: false,
    useWorkerFetch: false,
  }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items
      .filter((item): item is typeof item & { str: string } => 'str' in item)
      .map(({ str }) => str)
      .join(''));
  }
  return { pageCount: pdf.numPages, text: pages.join('\n') };
}

async function textItems(blob: Blob): Promise<Array<{ size: number; str: string; x: number; y: number }>> {
  const pdf = await getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    isEvalSupported: false,
    useWorkerFetch: false,
  }).promise;
  const items: Array<{ size: number; str: string; x: number; y: number }> = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !('transform' in item)) continue;
      const transform = item.transform as number[];
      items.push({
        size: Math.max(Math.abs(transform[0] ?? 0), Math.abs(transform[3] ?? 0)),
        str: item.str,
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
      });
    }
  }
  return items;
}

describe('PDF vector math renderer', () => {
  it('renders mathematical primes as searchable U+2032 superscripts without changing text apostrophes or commas', async () => {
    const result = await renderStructuredPdf(request([
      mathBlock("x'"),
      mathBlock("Z_{t-L:t}'"),
      mathBlock(String.raw`x^{\prime}`),
      mathBlock(String.raw`\text{don't}`),
      mathBlock(String.raw`Z_{t-L:t},U_t`),
    ]), { fontEnvironment });
    const inspection = await inspect(result.blob);
    const items = await textItems(result.blob);
    const primeSizes = items.filter(({ str }) => str.includes('′')).map(({ size }) => size);
    const baseSizes = items.filter(({ str }) => str === 'x' || str === 'Z').map(({ size }) => size);

    expect(inspection.text).toContain('′');
    expect(inspection.text).toContain("don't");
    expect(inspection.text).toContain(',');
    expect(inspection.text).not.toContain('’');
    expect(primeSizes.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...primeSizes)).toBeLessThan(Math.max(...baseSizes));
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('renders the M16 complex formula set without visible PDF math fallback', async () => {
    const result = await renderStructuredPdf(request(
      M16_COMPLEX_FORMULAS.map(({ fallbackText, source }) => mathBlock(source, 'tex', fallbackText)),
    ), { fontEnvironment });
    const inspection = await inspect(result.blob);

    expect(inspection.pageCount).toBeGreaterThanOrEqual(1);
    expect(inspection.text).toContain('arg');
    expect(inspection.text).toContain('max');
    expect(inspection.text).toContain('Lint');
    expect(inspection.text).toContain('CE');
    expect(inspection.text).toContain('动态代理');
    expect(inspection.text).not.toContain('Unsupported equation');
    expect(inspection.text).not.toContain('\u0000');
    expect(inspection.text).not.toContain('\uFFFD');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('promotes the live causal-effect fallback text to vector PDF math', async () => {
    const result = await renderStructuredPdf(request([
      mathBlock(
        String.raw`\unsupportedLiveWrapper{CEa}`,
        'tex',
        'CEa→sj=Est[Vara(s^j,t+₁do(a))]',
      ),
    ]), { fontEnvironment });
    const inspection = await inspect(result.blob);

    expect(inspection.text).toContain('CE');
    expect(inspection.text).toContain('Var');
    expect(inspection.text).not.toContain('Unsupported equation');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('renders the M16 SOC lecture formula set without visible PDF math fallback or U+27F9 abort', async () => {
    const result = await renderStructuredPdf(request(
      M16_SOC_FORMULAS.map((source) => mathBlock(source)),
    ), { fontEnvironment });
    const inspection = await inspect(result.blob);

    expect(inspection.pageCount).toBeGreaterThanOrEqual(1);
    expect(inspection.text).toContain('\u27f9');
    expect(inspection.text).toContain('\u27f6');
    expect(inspection.text).toContain('\u21d3');
    expect(inspection.text).toContain('\u21cf');
    expect(inspection.text).toContain('\u2217');
    expect(inspection.text).toContain('\u220f');
    expect(inspection.text).toContain('%');
    expect(inspection.text).not.toContain('Unsupported equation');
    expect(inspection.text).not.toContain('\u0000');
    expect(inspection.text).not.toContain('\uFFFD');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('renders display-style large-operator limits without flattened PDF glyphs', async () => {
    const dom = new JSDOM();
    const result = await renderStructuredPdf(request([
      mathBlock(String.raw`H(p)=-\sum_i p_i\log p_i`),
      mathBlock(String.raw`\max_\theta \sum_t \log p_\theta(x_t\mid x_{<t})`),
      mathBlock(
        '<math><mrow><mi>H</mi><mo>=</mo><mo>-</mo><msub><mo>∑</mo><mi>i</mi></msub><msub><mi>p</mi><mi>i</mi></msub><mi>log</mi><msub><mi>p</mi><mi>i</mi></msub></mrow></math>',
        'mathml',
      ),
    ]), {
      fontEnvironment,
      mathEnvironment: {
        parseMathMl: (source) => new dom.window.DOMParser().parseFromString(source, 'application/xml'),
      },
    });
    const inspection = await inspect(result.blob);
    const items = await textItems(result.blob);
    const sums = items.filter(({ str }) => str.includes('∑'));
    const scriptItems = items.filter(({ size, str }) => (str === 'i' || str === 't') && size < 9);

    expect(inspection.text).toContain('∑');
    expect(inspection.text).toContain('max');
    expect(inspection.text).toContain('θ');
    expect(inspection.text).not.toContain('□');
    expect(Math.max(...sums.map(({ size }) => size))).toBeGreaterThan(REFERENCE_EXPORT_PROFILE.math.fontSizePt);
    expect(scriptItems.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('renders the live English-and error cases formula without PDF fallback', async () => {
    const result = await renderStructuredPdf(request([
      mathBlock(String.raw`Error(x,y)
=
\begin{cases}
1, & P(y|x) > T \ \text{and}\ y \ne y_{\text{SFT}} \\
0, & otherwise
\end{cases}`),
      mathBlock(String.raw`A\land B`),
    ]), { fontEnvironment });
    const inspection = await inspect(result.blob);

    expect(inspection.text).toContain('Error');
    expect(inspection.text).toContain('T and y');
    expect(inspection.text).toContain('≠');
    expect(inspection.text).toContain('SFT');
    expect(inspection.text).toContain('otherwise');
    expect(inspection.text).toContain('∧');
    expect(inspection.text).not.toContain('Unsupported equation');
    expect(inspection.text).not.toContain('\u0000');
    expect(inspection.text).not.toContain('\uFFFD');
    expect(inspection.text).not.toContain('□');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('renders the six fresh post-control-space sample formulas without PDF fallback', async () => {
    const formulas = [
      String.raw`S_t=\gamma S_{t-1}+K_t^\top V_t`,
      String.raw`QK^\top V`,
      String.raw`S^{t+1:t+K},Y^{t+1:t+K}=D(F_t,\pi,\theta,\xi)`,
      String.raw`r_i=\frac{1}{\sqrt{\frac{1}{d}\sum_j h_{ij}^2+\epsilon}}`,
      String.raw`z^{t+1}(k)=F_\psi(\tilde{z}_t(k),a_t)`,
      String.raw`s_{t+1}=F(x_{\leq t},a_{\leq t})`,
      String.raw`s_t\xrightarrow{a_t}s_{t+1}`,
      String.raw`\ell+\exp(x)`,
    ];
    const result = await renderStructuredPdf(
      request(formulas.map((source) => mathBlock(source))),
      { fontEnvironment },
    );
    const inspection = await inspect(result.blob);

    for (const value of ['\u22a4', '\u03be', '\u03c8', '\u2264', '\u2192', '\u2113', 'exp']) {
      expect(inspection.text).toContain(value);
    }
    expect(inspection.text).not.toContain('Unsupported equation');
    expect(inspection.text).not.toContain('\u0000');
    expect(inspection.text).not.toContain('\uFFFD');
    expect(inspection.text).not.toContain('□');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('renders chat7 literal identifiers and dot accents without PDF fallback', async () => {
    const result = await renderStructuredPdf(request([
      mathBlock(String.raw`C^2+3C\times\text{latent_dim}`),
      mathBlock(String.raw`C^2+3C\times latent\_dim=768^2+3\times768\times96`),
      mathBlock(String.raw`3C^2=3\times768^2=1769472`),
      mathBlock(String.raw`\dot{x}_{n-1}(t)-\dot{x}_n(t)+\ddot{x}_n(t)`),
    ]), { fontEnvironment });
    const inspection = await inspect(result.blob);

    expect(inspection.text).toContain('latent');
    expect(inspection.text).toContain('_');
    expect(inspection.text).toContain('dim');
    expect(inspection.text).toContain('1769472');
    expect(inspection.text).not.toContain('Unsupported equation');
    expect(inspection.text).not.toContain('\u0000');
    expect(inspection.text).not.toContain('\uFFFD');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('renders the two chat11 omega dynamics formulas without PDF fallback', async () => {
    const result = await renderStructuredPdf(request([
      mathBlock(String.raw`R_{t+1}=R_t\exp\left([\omega_t]_{\times}\Delta t\right)`),
      mathBlock(String.raw`\omega_{t+1}=\omega_t+\Delta\tau_t\Delta t`),
    ]), { fontEnvironment });
    const inspection = await inspect(result.blob);

    for (const value of ['ω', 'exp', '×', 'Δ', 'τ']) expect(inspection.text).toContain(value);
    expect(inspection.text).not.toContain('Unsupported equation');
    expect(inspection.text).not.toContain('\u0000');
    expect(inspection.text).not.toContain('\uFFFD');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('renders the exact chat12-14 varphi, bar, sup, norm, and sigma formulas without PDF fallback', async () => {
    const formulas = [
      String.raw`\tilde{s}_{t+1}=Pred_\varphi(s_t,z_t)`,
      String.raw`\tilde{s}_{t+T}=Pred_\varphi(...Pred_\varphi(Pred_\varphi(s_t,z_t),z_{t+1}),...,z_{t+T-1})`,
      String.raw`PS(S,q)=P(A_{do(S)}=y|A\neq y,\bar{S},q)`,
      String.raw`PN(S,s_t,q)=P(A_{do(s_{<t},\bar{s}_t,s'_{>t})}\neq y|A=y,S,q)`,
      String.raw`\bar{s}_t`,
      String.raw`E^\star(s,a,g)=\log \rho^\pi(g|s,a)-\log \bar{\rho}_B^\pi(g)`,
      String.raw`\sup|\hat{E}_k-E_k|\propto\|A_0^k\|\|e\|+\frac{1}{2}\|A_0^k\|^2\|e\|^2`,
      String.raw`w_k=\epsilon+\exp\left(-\frac{\|d_{t+k}-c\|^2}{2\sigma^2}\right)`,
      String.raw`w_k=\epsilon+\exp\left(-\frac{(d_{sep,k}-c_{sep})^2}{2\sigma^2}\right)`,
      String.raw`\left|\hat{E}_k-E_k\right|+\left(\left\|d_{t+k}-c\right\|\right)+\sup_x f(x)`,
    ];
    const result = await renderStructuredPdf(
      request(formulas.map((source) => mathBlock(source))),
      { fontEnvironment },
    );
    const inspection = await inspect(result.blob);

    for (const value of ['Pred', 'φ', 'σ', 'sup', 'exp', 'PS', 'PN']) {
      expect(inspection.text).toContain(value);
    }
    expect(inspection.text).not.toContain('Unsupported equation');
    expect(inspection.text).not.toContain('\u0000');
    expect(inspection.text).not.toContain('\uFFFD');
    expect(inspection.text).not.toContain('■');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('uses a symmetric inverted-V hat accent for paired o and r formulas', async () => {
    const [left, right] = pdfHatAccentSegments(10, 20, 8, 12);
    expect(left.start.y).toBe(right.end.y);
    expect(left.end.y).toBe(right.start.y);
    expect(left.end.x).toBe(right.start.x);
    expect(left.end.y).toBeGreaterThan(left.start.y);
    expect(left.start.x).toBeLessThan(left.end.x);
    expect(right.end.x).toBeGreaterThan(right.start.x);
    expect(left.end.x - left.start.x).toBeCloseTo(right.end.x - right.start.x, 5);

    const result = await renderStructuredPdf(request([
      mathBlock(String.raw`L_{int}=\left\lVert \hat{o}^{do(a)}_{t+1}-o^{real}_{t+1}\right\rVert^2+\left\lVert \hat{r}^{do(a)}_{t+1}-r^{real}_{t+1}\right\rVert^2`),
    ]), { fontEnvironment });
    const inspection = await inspect(result.blob);

    expect(inspection.text).toContain('Lint');
    expect(inspection.text).not.toContain('Unsupported equation');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('renders the supported TeX and MathML fixture matrix without fallback', async () => {
    const dom = new JSDOM();
    const result = await renderStructuredPdf(request([
      mathBlock('\\frac{a}{b}'),
      mathBlock('x_i^2'),
      mathBlock('\\sqrt[3]{x}'),
      mathBlock('\\sum_{i=1}^{n} i'),
      mathBlock('\\int_0^1 x\\,dx'),
      mathBlock('\\left( a+b \\right)'),
      mathBlock('\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}'),
      mathBlock('\\alpha + \\beta \\le \\infty'),
      mathBlock('\\mathcal{T}_m^\\alpha \\rightarrow R_{UA} \\subseteq Z_{int}'),
      mathBlock(String.raw`p_\beta\!\left(s_{k,t}\mid D_k^{s\to s}\odot s_{t-1},D_k^{\theta_i\to s}\odot \theta_i^s,D_k^{a\to s}\odot a_{t-1}\right)`),
      mathBlock(String.raw`a^\star`),
      mathBlock('\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}'),
      mathBlock(
        '<math><mfrac><mi>c</mi><mi>d</mi></mfrac></math>',
        'mathml',
        'c/d',
      ),
    ]), {
      fontEnvironment,
      mathEnvironment: {
        parseMathMl: (source) => (
          new dom.window.DOMParser().parseFromString(source, 'application/xml')
        ),
      },
    });
    const inspection = await inspect(result.blob);

    expect(inspection.pageCount).toBeGreaterThanOrEqual(1);
    for (const text of ['a', 'b', 'x', '∑', '∫', '1', '4', 'α', 'β', '≤', '∞', 'c', 'd', 'T', 'R', 'Z', '→', '⊆', '∣', '⊙', '⋆']) {
      expect(inspection.text).toContain(text);
    }
    expect(inspection.text).not.toContain('𝒯');
    expect(inspection.text).not.toContain('𝒵');
    expect(inspection.text).not.toContain('ℛ');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('preserves unsupported math as visible fallback text and warning provenance', async () => {
    const result = await renderStructuredPdf(request([
      mathBlock('\\color{red}{x}', 'tex', 'Unsupported color expression: x'),
    ]), { fontEnvironment });
    const inspection = await inspect(result.blob);

    expect(inspection.text).toContain('Unsupported color expression: x');
    expect(result.warnings).toContainEqual({
      code: 'math-fallback',
      message: 'Unsupported PDF math was preserved as visible fallback text.',
      provenance: {
        messageId: 'assistant-math',
        nodePath: [0],
        sourceKind: 'mathBlock',
        stage: 'render',
      },
    });
  });

  it('preserves Unicode subscript fallback text without aborting the PDF export', async () => {
    const result = await renderStructuredPdf(request([
      mathBlock(String.raw`\color{red}{x_5}`, 'tex', 'x₅'),
    ]), { fontEnvironment });
    const inspection = await inspect(result.blob);

    expect(inspection.text).toContain('x5');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toHaveLength(1);
  });

  it('normalizes Unicode subscript letters before PDF font discovery', async () => {
    const result = await renderStructuredPdf(request([
      mathBlock(String.raw`s_{k,t} + D_k^s + t_{-1}`, 'tex', 'sₖ,ₜ + Dₖˢ + t₋₁'),
    ]), { fontEnvironment });
    const inspection = await inspect(result.blob);

    expect(inspection.text).toContain('sk, t');
    expect(inspection.text).toContain('Dsk');
    expect(inspection.text).toContain('t- 1');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('uses parseable fallback text instead of warning when a live source wrapper is unsupported', async () => {
    const result = await renderStructuredPdf(request([
      mathBlock(
        '\\unsupportedLiveWrapper{release/hold/v_u(t)}',
        'tex',
        'release/hold/v_u(t)',
      ),
    ]), { fontEnvironment });
    const inspection = await inspect(result.blob);

    expect(inspection.text).toContain('release/hold/vu(t)');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });

  it('uses the shared profile size for display math and ordinary delimiters', async () => {
    const renderRequest = request([
      mathBlock('\\left[0,H\\right]', 'tex', '[0,H]'),
    ]);
    renderRequest.options.paper = 'letter';
    const result = await renderStructuredPdf(renderRequest, { fontEnvironment });
    const items = await textItems(result.blob);
    const mathItems = items.filter(({ str }) =>
      ['[', '0', ',', 'H', ']'].some((token) => str.includes(token)));
    const largestMathSize = Math.max(...mathItems.map(({ size }) => size));

    expect(mathItems.map(({ str }) => str).join('')).toContain('[0,H]');
    expect(largestMathSize).toBeLessThanOrEqual(
      REFERENCE_EXPORT_PROFILE.body.fontSizePt + 0.3,
    );
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
  });
});
