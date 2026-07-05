import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';

import type { BlockNode, ChatDocument } from '../../../src/document/ast';
import type { ExportRequest } from '../../../src/document/export';
import {
  renderStructuredDocx,
  renderStructuredDocxBlob,
} from '../../../src/renderers/docx/docx-node-renderer';
import {
  createEditableWordMath,
  createEditableWordMathFromNode,
} from '../../../src/renderers/docx/math-to-omml';

function mathBlock(source: string, fallbackText = source): BlockNode {
  return { fallbackText, kind: 'mathBlock', source, sourceFormat: 'tex' };
}

function request(content: BlockNode[]): ExportRequest {
  const document: ChatDocument = {
    version: 1,
    title: 'Editable Math Fixture',
    source: {
      platform: 'chatgpt',
      url: 'https://chatgpt.com/c/math-docx',
      capturedAt: '2026-06-22T10:00:00.000Z',
    },
    exportedAt: '2026-06-22T10:01:00.000Z',
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
      fileName: 'editable-math',
      format: 'docx',
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

async function documentXml(content: BlockNode[]): Promise<string> {
  const blob = await renderStructuredDocxBlob(request(content));
  const archive = await JSZip.loadAsync(await blob.arrayBuffer());
  return archive.file('word/document.xml')!.async('string');
}

describe('editable Word math rendering', () => {
  it('renders mathematical primes as U+2032 superscripts without changing text apostrophes or commas', async () => {
    const fallbackResolver = vi.fn(async () => {
      throw new Error('Supported prime syntax must not request a DOCX SVG fallback.');
    });
    const result = await renderStructuredDocx(request([
      mathBlock("x'"),
      mathBlock("Z_{t-L:t}'"),
      mathBlock(String.raw`x^{\prime}`),
      mathBlock(String.raw`\text{don't}`),
      mathBlock(String.raw`Z_{t-L:t},U_t`),
    ]), { mathFallbackResolver: fallbackResolver });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await archive.file('word/document.xml')!.async('string');

    expect(xml).toContain('<m:sSup>');
    expect(xml).toContain('<m:sSubSup>');
    expect(xml).toContain('<m:t>′</m:t>');
    expect(xml).toContain('<m:t>&apos;</m:t>');
    expect(xml).toContain('<m:t>,</m:t>');
    expect(xml).not.toContain('’');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(fallbackResolver).not.toHaveBeenCalled();
  });

  it('renders the M16 complex formula set as native Word math without SVG fallback', async () => {
    const fallbackResolver = vi.fn(async () => {
      throw new Error('M16 formulas must not request a DOCX SVG fallback.');
    });
    const result = await renderStructuredDocx(request(
      M16_COMPLEX_FORMULAS.map(({ fallbackText, source }) => mathBlock(source, fallbackText)),
    ), { mathFallbackResolver: fallbackResolver });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await archive.file('word/document.xml')!.async('string');
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );

    expect(xml.match(/<m:oMath>/gu)).toHaveLength(M16_COMPLEX_FORMULAS.length);
    expect(xml.match(/<m:oMathPara>/gu)).toHaveLength(M16_COMPLEX_FORMULAS.length);
    expect(xml).toContain('<m:acc>');
    expect(xml).toContain('∥');
    expect(xml).toContain('arg');
    expect(xml).toContain('max');
    for (const character of ['动', '态', '代', '理', '：']) {
      expect(xml).toContain(`<m:t>${character}</m:t>`);
    }
    expect(media).toEqual([]);
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(fallbackResolver).not.toHaveBeenCalled();
  });

  it('promotes the live causal-effect fallback text to native Word math', async () => {
    const fallbackResolver = vi.fn(async () => {
      throw new Error('Live CE fallback text must not request a DOCX SVG fallback.');
    });
    const result = await renderStructuredDocx(request([
      mathBlock(
        String.raw`\unsupportedLiveWrapper{CEa}`,
        'CEa→sj=Est[Vara(s^j,t+₁do(a))]',
      ),
    ]), { mathFallbackResolver: fallbackResolver });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await archive.file('word/document.xml')!.async('string');
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );

    expect(xml.match(/<m:oMath>/gu)).toHaveLength(1);
    expect(xml).toContain('<m:t>C</m:t>');
    expect(xml).toContain('<m:t>E</m:t>');
    expect(xml).toContain('<m:t>V</m:t>');
    expect(xml).toContain('<m:t>a</m:t>');
    expect(xml).toContain('<m:t>r</m:t>');
    expect(xml).toContain('→');
    expect(xml).toContain('<m:sSub>');
    expect(media).toEqual([]);
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(fallbackResolver).not.toHaveBeenCalled();
  });

  it('renders the M16 SOC lecture formula set as native Word math without SVG fallback', async () => {
    const fallbackResolver = vi.fn(async () => {
      throw new Error('M16 SOC formulas must not request a DOCX SVG fallback.');
    });
    const result = await renderStructuredDocx(request(
      M16_SOC_FORMULAS.map((source) => mathBlock(source)),
    ), { mathFallbackResolver: fallbackResolver });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await archive.file('word/document.xml')!.async('string');
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );

    expect(xml.match(/<m:oMath>/gu)).toHaveLength(M16_SOC_FORMULAS.length);
    expect(xml.match(/<m:oMathPara>/gu)).toHaveLength(M16_SOC_FORMULAS.length);
    expect(xml).toContain('\u27f9');
    expect(xml).toContain('\u27f6');
    expect(xml).toContain('\u21d3');
    expect(xml).toContain('\u21cf');
    expect(xml).toContain('\u2217');
    expect(xml).toContain('\u220f');
    expect(xml).toContain('%');
    expect(media).toEqual([]);
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(fallbackResolver).not.toHaveBeenCalled();
  });

  it('renders display-style large-operator limits in native Word math', async () => {
    const fallbackResolver = vi.fn(async () => {
      throw new Error('Display large-operator limits must not request a DOCX SVG fallback.');
    });
    const dom = new JSDOM();
    const result = await renderStructuredDocx(request([
      mathBlock(String.raw`H(p)=-\sum_i p_i\log p_i`),
      mathBlock(String.raw`\max_\theta \sum_t \log p_\theta(x_t\mid x_{<t})`),
    ]), { mathFallbackResolver: fallbackResolver });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await archive.file('word/document.xml')!.async('string');
    const mathMl = createEditableWordMath(
      '<math><mrow><mi>H</mi><mo>=</mo><mo>-</mo><msub><mo>∑</mo><mi>i</mi></msub><msub><mi>p</mi><mi>i</mi></msub><mi>log</mi><msub><mi>p</mi><mi>i</mi></msub></mrow></math>',
      'mathml',
      (source) => new dom.window.DOMParser().parseFromString(source, 'application/xml'),
    );

    expect(mathMl).toBeDefined();
    expect(xml.match(/<m:nary>/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(xml).toContain('m:val="undOvr"');
    expect(xml).toContain('<m:limLow>');
    expect(xml).toContain('<m:lim>');
    expect(xml).toContain('<m:t>max</m:t>');
    expect(xml).toContain('<m:t>θ</m:t>');
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(fallbackResolver).not.toHaveBeenCalled();
  });

  it('renders the live English-and error cases formula as native Word math', async () => {
    const fallbackResolver = vi.fn(async () => {
      throw new Error('The live error cases formula must not request a DOCX SVG fallback.');
    });
    const result = await renderStructuredDocx(request([
      mathBlock(String.raw`Error(x,y)
=
\begin{cases}
1, & P(y|x) > T \ \text{and}\ y \ne y_{\text{SFT}} \\
0, & otherwise
\end{cases}`),
      mathBlock(String.raw`A\land B`),
    ]), { mathFallbackResolver: fallbackResolver });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await archive.file('word/document.xml')!.async('string');
    const mathText = [...xml.matchAll(/<m:t>(.*?)<\/m:t>/gu)]
      .map(([, value]) => value)
      .join('');
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );

    expect(xml.match(/<m:oMath>/gu)).toHaveLength(2);
    expect(xml).toContain('<m:m>');
    expect(xml).toContain('<m:sSub>');
    expect(xml).toContain('<m:t>≠</m:t>');
    expect(xml).toContain('<m:t>∧</m:t>');
    expect(mathText).toContain('T and y');
    expect(mathText).toContain('SFT');
    expect(media).toEqual([]);
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(fallbackResolver).not.toHaveBeenCalled();
  });

  it('renders the six fresh post-control-space sample formulas as native Word math', async () => {
    const fallbackResolver = vi.fn(async () => {
      throw new Error('Six-sample formulas must not request a DOCX SVG fallback.');
    });
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
    const result = await renderStructuredDocx(
      request(formulas.map((source) => mathBlock(source))),
      { mathFallbackResolver: fallbackResolver },
    );
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await archive.file('word/document.xml')!.async('string');
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );

    expect(xml.match(/<m:oMath>/gu)).toHaveLength(formulas.length);
    expect(xml.match(/<m:acc>/gu)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(xml.match(/<m:nary>/gu)?.length ?? 0).toBeGreaterThanOrEqual(1);
    for (const value of ['\u22a4', '\u03be', '\u03c8', '\u2264', '\u2192', '\u2113', 'exp']) {
      expect(xml).toContain(value);
    }
    expect(xml).toContain('m:val="\u0303"');
    expect(media).toEqual([]);
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(fallbackResolver).not.toHaveBeenCalled();
  });

  it('renders chat7 literal identifiers and dot accents as native Word math', async () => {
    const fallbackResolver = vi.fn(async () => {
      throw new Error('Chat7 identifiers and dot accents must not request a DOCX SVG fallback.');
    });
    const formulas = [
      String.raw`C^2+3C\times\text{latent_dim}`,
      String.raw`C^2+3C\times latent\_dim=768^2+3\times768\times96`,
      String.raw`3C^2=3\times768^2=1769472`,
      String.raw`\dot{x}_{n-1}(t)-\dot{x}_n(t)+\ddot{x}_n(t)`,
    ];
    const result = await renderStructuredDocx(
      request(formulas.map((source) => mathBlock(source))),
      { mathFallbackResolver: fallbackResolver },
    );
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await archive.file('word/document.xml')!.async('string');
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );

    expect(xml.match(/<m:oMath>/gu)).toHaveLength(formulas.length);
    for (const value of ['l', 'a', 't', 'e', 'n', 'd', 'i', 'm', '_']) {
      expect(xml).toContain(`<m:t>${value}</m:t>`);
    }
    expect(xml).toContain('m:val="\u0307"');
    expect(xml).toContain('m:val="\u0308"');
    expect(media).toEqual([]);
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(fallbackResolver).not.toHaveBeenCalled();
  });

  it('renders the two chat11 omega dynamics formulas as native Word math', async () => {
    const fallbackResolver = vi.fn(async () => {
      throw new Error('Chat11 omega formulas must not request a DOCX SVG fallback.');
    });
    const formulas = [
      String.raw`R_{t+1}=R_t\exp\left([\omega_t]_{\times}\Delta t\right)`,
      String.raw`\omega_{t+1}=\omega_t+\Delta\tau_t\Delta t`,
    ];
    const result = await renderStructuredDocx(
      request(formulas.map((source) => mathBlock(source))),
      { mathFallbackResolver: fallbackResolver },
    );
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await archive.file('word/document.xml')!.async('string');
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );

    expect(xml.match(/<m:oMath>/gu)).toHaveLength(formulas.length);
    for (const value of ['ω', 'exp', '×', 'Δ', 'τ']) expect(xml).toContain(value);
    expect(xml.match(/<m:sSub>/gu)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(media).toEqual([]);
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(fallbackResolver).not.toHaveBeenCalled();
  });

  it('renders the exact chat12-14 varphi, bar, sup, norm, and sigma formulas as native Word math', async () => {
    const fallbackResolver = vi.fn(async () => {
      throw new Error('Chat12-14 standard TeX formulas must not request a DOCX SVG fallback.');
    });
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
    const result = await renderStructuredDocx(
      request(formulas.map((source) => mathBlock(source))),
      { mathFallbackResolver: fallbackResolver },
    );
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await archive.file('word/document.xml')!.async('string');
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );

    expect(xml.match(/<m:oMath>/gu)).toHaveLength(formulas.length);
    expect(xml).toContain('φ');
    expect(xml).toContain('σ');
    expect(xml).toContain('m:val="\u0305"');
    expect(xml).toContain('<m:t>sup</m:t>');
    expect(xml).toContain('′');
    expect(xml).toContain('<m:t>|</m:t>');
    expect(xml).toContain('<m:t>∥</m:t>');
    expect(media).toEqual([]);
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(fallbackResolver).not.toHaveBeenCalled();
  });

  it('preserves the fresh transition formula and star action as structured OMML', async () => {
    const transition = String.raw`p_\beta\!\left(s_{k,t}\mid D_k^{s\to s}\odot s_{t-1},D_k^{\theta_i\to s}\odot \theta_i^s,D_k^{a\to s}\odot a_{t-1}\right)`;
    const fallbackResolver = vi.fn(async () => {
      throw new Error('Structured real-shape math must not request a fallback.');
    });
    const result = await renderStructuredDocx(request([
      mathBlock(transition, 'pβ(sₖ,ₜ∣Dₖˢ→ˢ⊙sₜ₋₁,Dₖθᵢ→ˢ⊙θᵢˢ,Dₖᵃ→ˢ⊙aₜ₋₁)'),
      mathBlock(String.raw`a^\star`, 'a⋆'),
    ]), { mathFallbackResolver: fallbackResolver });
    const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
    const xml = await archive.file('word/document.xml')!.async('string');
    const media = Object.keys(archive.files).filter(
      (name) => name.startsWith('word/media/') && !name.endsWith('/'),
    );

    expect(xml.match(/<m:sSub>/gu)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(xml.match(/<m:sSubSup>/gu)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(xml).toContain('<m:d>');
    expect(xml).toContain('⋆');
    expect(media).toEqual([]);
    expect(result.warnings.filter(({ code }) => code === 'math-fallback')).toEqual([]);
    expect(fallbackResolver).not.toHaveBeenCalled();
  });

  it('maps the five live-export fallback positions from real TeX-shaped sources to OMML', async () => {
    expect(createEditableWordMath('\\tau \\in [0,H]', 'tex')).toBeDefined();
    expect(createEditableWordMath('Z_{int}\\downarrow q=3', 'tex')).toBeDefined();
    expect(createEditableWordMath('release/hold/vu(t)', 'tex')).toBeDefined();

    const tau = {
      fallbackText: 'τ∈[0,H]',
      kind: 'mathInline' as const,
      source: '\\tau \\in [0,H]',
      sourceFormat: 'tex' as const,
    };
    const xml = await documentXml([
      { children: [{ kind: 'text', value: 'A ' }, tau], kind: 'paragraph' },
      { children: [{ kind: 'text', value: 'B ' }, tau], kind: 'paragraph' },
      mathBlock('Z_{int}\\downarrow q=3', 'Z_int ↓ q=3'),
      mathBlock('\\text{release/hold}/v_u(t)', 'release/hold/v_u(t)'),
      mathBlock('release/hold/vu(t)', 'release/hold/vu(t)'),
      { children: [{ kind: 'text', value: 'C ' }, tau], kind: 'paragraph' },
    ]);

    expect(xml.match(/<m:oMath>/gu)).toHaveLength(6);
    expect(xml.match(/<m:oMathPara>/gu)).toHaveLength(3);
    expect(xml).toContain('τ');
    expect(xml).toContain('∈');
    expect(xml).toContain('↓');
    expect(xml).not.toContain('Z_int ↓ q=3');
    expect(xml).not.toContain('release/hold/v_u(t)');
    expect(xml).not.toContain('release/hold/vu(t)');
  });

  it('uses parseable fallback text when the live source shape is unsupported', async () => {
    expect(createEditableWordMathFromNode({
      fallbackText: 'release/hold/v_u(t)',
      source: '\\unsupportedLiveWrapper{release/hold/v_u(t)}',
      sourceFormat: 'tex',
    })).toBeDefined();

    const xml = await documentXml([{
      fallbackText: 'release/hold/v_u(t)',
      kind: 'mathBlock',
      source: '\\unsupportedLiveWrapper{release/hold/v_u(t)}',
      sourceFormat: 'tex',
    }]);

    expect(xml).toContain('<m:oMath>');
    expect(xml).toContain('<m:oMathPara>');
    expect(xml).not.toContain('release/hold/v_u(t)');
  });

  it('does not misreport a flattened Unicode-script fallback as structured math', () => {
    expect(createEditableWordMathFromNode({
      fallbackText: 'pβ(sₖ,ₜ∣sₜ₋₁)',
      source: String.raw`p_\beta\left(s_{k,t}\unsupportedOperator s_{t-1}\right)`,
      sourceFormat: 'tex',
    })).toBeUndefined();
  });

  it('uses parseable fallback text when an unsupported MathML wrapper is supplied', async () => {
    const dom = new JSDOM();
    expect(createEditableWordMathFromNode({
      fallbackText: 'release/hold/v_u(t)',
      source: '<math><mstyle><mtext>release/hold/vu(t)</mtext></mstyle></math>',
      sourceFormat: 'mathml',
    }, (source) => new dom.window.DOMParser().parseFromString(source, 'application/xml')))
      .toBeDefined();
  });

  it('maps the supported TeX matrix to native OMML structures', async () => {
    const xml = await documentXml([
      {
        kind: 'paragraph',
        children: [
          { kind: 'text', value: 'Inline: ' },
          { fallbackText: 'E=mc2', kind: 'mathInline', source: 'E=mc^2', sourceFormat: 'tex' },
        ],
      },
      mathBlock('\\frac{a}{b}'),
      mathBlock('x_i^2'),
      mathBlock('\\sqrt[3]{x}'),
      mathBlock('\\sum_{i=1}^{n} i'),
      mathBlock('\\int_0^1 x\\,dx'),
      mathBlock('\\left( a+b \\right)'),
      mathBlock('\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}'),
      mathBlock('\\alpha + \\beta \\le \\infty'),
      mathBlock('\\mathcal{T}_m^\\alpha \\rightarrow R_{UA} \\subseteq Z_{int}'),
      mathBlock('\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}'),
    ]);

    expect(xml).toContain('<m:oMath>');
    expect(xml).toContain('<m:f>');
    expect(xml).toContain('<m:sSubSup>');
    expect(xml).toContain('<m:rad>');
    expect(xml).toContain('<m:nary>');
    expect(xml).toContain('<m:d>');
    expect(xml).toContain('<m:m>');
    expect(xml).toContain('<m:mr>');
    expect(xml).toContain('𝒯');
    expect(xml).toContain('→');
    expect(xml).toContain('⊆');
    expect(xml).toContain('w:pStyle w:val="ChatExportMath"');
    expect(xml).toContain('α');
    expect(xml).toContain('∞');
    expect(xml).not.toContain('E=mc2');
  });

  it('maps common MathML structures through a structured XML parser', () => {
    const dom = new JSDOM();
    const math = createEditableWordMath(
      '<math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>',
      'mathml',
      (source) => new dom.window.DOMParser().parseFromString(source, 'application/xml'),
    );

    expect(math).toBeDefined();
    expect(createEditableWordMath(
      '<math><mi mathvariant="script">T</mi><mo>→</mo><msub><mi>Z</mi><mi>int</mi></msub></math>',
      'mathml',
      (source) => new dom.window.DOMParser().parseFromString(source, 'application/xml'),
    )).toBeDefined();
  });

  it('keeps unsupported TeX visible as fallback text', async () => {
    const xml = await documentXml([mathBlock('\\color{red}{x}', 'unsupported: x')]);

    expect(xml).toContain('unsupported: x');
    expect(xml).not.toContain('<m:oMath>');
  });
});
