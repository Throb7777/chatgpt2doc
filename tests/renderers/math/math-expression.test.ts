import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { parseMathExpression } from '../../../src/renderers/math/math-expression';

describe('shared mathematical prime parsing', () => {
  it('normalizes postfix and explicit mathematical prime forms to U+2032 superscripts', () => {
    expect(parseMathExpression("x'", 'tex')).toMatchObject({
      base: { kind: 'text', value: 'x' },
      kind: 'script',
      sup: { kind: 'text', value: '′' },
    });
    expect(parseMathExpression("x''", 'tex')).toMatchObject({
      base: { kind: 'text', value: 'x' },
      kind: 'script',
      sup: { kind: 'text', value: '′′' },
    });
    expect(parseMathExpression("Z_{t-L:t}'", 'tex')).toMatchObject({
      base: { kind: 'text', value: 'Z' },
      kind: 'script',
      sub: { kind: 'sequence' },
      sup: { kind: 'text', value: '′' },
    });
    expect(parseMathExpression("x'_i", 'tex')).toMatchObject({
      base: { kind: 'text', value: 'x' },
      kind: 'script',
      sub: { kind: 'text', value: 'i' },
      sup: { kind: 'text', value: '′' },
    });
    for (const source of [String.raw`x^{\prime}`, String.raw`x^{'}`, 'x^{’}', 'x^{′}']) {
      expect(parseMathExpression(source, 'tex')).toMatchObject({
        base: { kind: 'text', value: 'x' },
        kind: 'script',
        sup: { kind: 'text', value: '′' },
      });
    }
  });

  it('preserves literal text apostrophes and the confirmed dynamic-proxy comma', () => {
    const literalText = JSON.stringify(parseMathExpression(String.raw`\text{don't}`, 'tex'));
    const dynamicProxy = JSON.stringify(parseMathExpression(
      String.raw`\textbf{动态代理：}\quad Z_{t-L:t},U_t\rightarrow Z_{t+1:t+H}`,
      'tex',
    ));

    expect(literalText).toContain(`"value":"'"`);
    expect(literalText).not.toContain('′');
    expect(dynamicProxy).toContain(`"value":","`);
    expect(dynamicProxy).not.toContain('′');
  });
});

describe('shared M16 SOC lecture math parsing', () => {
  it('parses the bounded SOC lecture TeX subset without fallback-only commands', () => {
    for (const source of [
      String.raw`\text{知识缺口}\longrightarrow\text{流畅补全}\longrightarrow\text{自信输出}`,
      String.raw`80\%`,
      String.raw`\|h-\hat{h}\|^2`,
      String.raw`L=\|h-\hat{h}\|^2+\lambda\|z\|_1.`,
      String.raw`p(x_{1:T})=\prod_{t=1}^{T}p(x_t\mid x_{<t}).`,
      String.raw`q\longrightarrow\begin{cases}\text{回答}, & \text{若模型知道}\\ \text{拒答}, & \text{若模型不知道}\end{cases}`,
      String.raw`\Downarrow`,
      String.raw`\text{语言上合理}\not\Rightarrow\text{事实中为真}`,
      String.raw`a\ast`,
      String.raw`\boxed{\text{可靠的大模型系统，不应该只是更会回答，而应该更会判断什么时候不该回答。}}`,
    ]) {
      expect(() => parseMathExpression(source, 'tex')).not.toThrow();
    }

    const serialized = JSON.stringify(parseMathExpression(
      String.raw`\Longrightarrow+\longrightarrow+\Downarrow+\not\Rightarrow+a\ast+80\%`,
      'tex',
    ));
    expect(serialized).toContain('\u27f9');
    expect(serialized).toContain('\u27f6');
    expect(serialized).toContain('\u21d3');
    expect(serialized).toContain('\u21cf');
    expect(serialized).toContain('\u2217');
    expect(serialized).toContain('%');
  });
});

describe('shared display-limit math parsing', () => {
  it('parses TeX display operators with under/over limits instead of ordinary scripts', () => {
    const serialized = JSON.stringify(parseMathExpression(
      String.raw`\max_\theta \sum_t \log p_\theta(x_t\mid x_{<t})`,
      'tex',
    ));

    expect(serialized).toContain('"kind":"nary"');
    expect(serialized).toContain('"operator":"max"');
    expect(serialized).toContain('"operator":"sum"');
    expect(serialized).toContain('"lower":{"kind":"text","value":"θ"}');
    expect(serialized).toContain('"lower":{"kind":"text","value":"t"}');
  });

  it('promotes MathML sum/product/integral limit shapes to n-ary expressions', () => {
    const dom = new JSDOM();
    const parseMathMl = (source: string) =>
      new dom.window.DOMParser().parseFromString(source, 'application/xml');
    const serialized = JSON.stringify(parseMathExpression(
      '<math><mrow><mi>H</mi><mo>=</mo><mo>-</mo><msub><mo>∑</mo><mi>i</mi></msub><msub><mi>p</mi><mi>i</mi></msub><mi>log</mi><msub><mi>p</mi><mi>i</mi></msub></mrow></math>',
      'mathml',
      { parseMathMl },
    ));

    expect(serialized).toContain('"operator":"sum"');
    expect(serialized).toContain('"lower":{"kind":"text","value":"i"}');
    expect(serialized).toContain('"base":{"kind":"text","value":"p"}');
  });
});

describe('shared portable MathML wrapper parsing', () => {
  it('treats KaTeX mstyle as transparent and mspace as controlled spacing', () => {
    const dom = new JSDOM();
    const parseMathMl = (source: string) =>
      new dom.window.DOMParser().parseFromString(source, 'application/xml');
    const expression = parseMathExpression(
      '<math><mrow><mstyle scriptlevel="0" displaystyle="false"><msub><mi>x</mi><mn>2</mn></msub></mstyle><mspace width="1em"/><mo>+</mo><mn>1</mn></mrow></math>',
      'mathml',
      { parseMathMl },
    );
    const serialized = JSON.stringify(expression);

    expect(serialized).toContain('"kind":"script"');
    expect(serialized).toContain('"value":" "');
    expect(serialized).toContain('"value":"+"');
  });
});

describe('shared logical alias math parsing', () => {
  it('preserves the live English conjunction while parsing ne and land aliases', () => {
    const target = JSON.stringify(parseMathExpression(
      String.raw`Error(x,y)
=
\begin{cases}
1, & P(y|x) > T \ \text{and}\ y \ne y_{\text{SFT}} \\
0, & otherwise
\end{cases}`,
      'tex',
    ));
    const conjunction = JSON.stringify(parseMathExpression(String.raw`A\land B`, 'tex'));

    expect(target).toContain('"kind":"matrix"');
    expect(target).toContain('"value":"≠"');
    expect(target).toContain('"value":" "');
    for (const value of ['a', 'n', 'd', 'S', 'F', 'T']) {
      expect(target).toContain(`"value":"${value}"`);
    }
    expect(conjunction).toContain('"value":"∧"');
    expect(() => parseMathExpression(String.raw`A\@B`, 'tex')).toThrow();
  });
});

describe('shared six-sample post-control-space math parsing', () => {
  it('parses the standard TeX symbols and structures found in the six fresh exports', () => {
    for (const source of [
      String.raw`S_t=\gamma S_{t-1}+K_t^\top V_t`,
      String.raw`QK^\top V`,
      String.raw`S^{t+1:t+K},Y^{t+1:t+K}=D(F_t,\pi,\theta,\xi)`,
      String.raw`r_i=\frac{1}{\sqrt{\frac{1}{d}\sum_j h_{ij}^2+\epsilon}}`,
      String.raw`z^{t+1}(k)=F_\psi(\tilde{z}_t(k),a_t)`,
      String.raw`s_{t+1}=F(x_{\leq t},a_{\leq t})`,
      String.raw`s_t\xrightarrow{a_t}s_{t+1}`,
      String.raw`\ell+\exp(x)`,
    ]) {
      expect(() => parseMathExpression(source, 'tex')).not.toThrow();
    }

    const serialized = JSON.stringify(parseMathExpression(
      String.raw`K_t^\top+\xi+\psi+\tilde{z}+\ell+\exp(x)+x_{\leq t}+s_t\xrightarrow{a_t}s_{t+1}`,
      'tex',
    ));
    expect(serialized).toContain('\u22a4');
    expect(serialized).toContain('\u03be');
    expect(serialized).toContain('\u03c8');
    expect(serialized).toContain('\u2113');
    expect(serialized).toContain('\u2264');
    expect(serialized).toContain('\u2192');
    expect(serialized).toContain('"accent":"tilde"');
    expect(serialized).toContain('"value":"exp"');
  });
});

describe('shared chat7 literal identifier and dot-accent math parsing', () => {
  it('parses literal underscores and dot accents without reinterpreting normal subscripts', () => {
    for (const source of [
      String.raw`C^2+3C\times\text{latent_dim}`,
      String.raw`C^2+3C\times latent\_dim=768^2+3\times768\times96`,
      String.raw`\dot{x}_{n-1}(t)-\dot{x}_n(t)+\ddot{x}_n(t)`,
    ]) {
      expect(() => parseMathExpression(source, 'tex')).not.toThrow();
    }

    const identifier = JSON.stringify(parseMathExpression(
      String.raw`C^2+3C\times\text{latent_dim}`,
      'tex',
    ));
    const accents = JSON.stringify(parseMathExpression(
      String.raw`\dot{x}_{n-1}(t)+\ddot{x}_n(t)`,
      'tex',
    ));

    expect(identifier).toContain('"value":"_"');
    expect(accents).toContain('"accent":"dot"');
    expect(accents).toContain('"accent":"ddot"');
    expect(JSON.stringify(parseMathExpression(String.raw`x_i`, 'tex'))).toContain('"kind":"script"');
  });
});

describe('shared chat11 omega math parsing', () => {
  it('parses the two omega dynamics formulas without fallback-only normalization', () => {
    const formulas = [
      String.raw`R_{t+1}=R_t\exp\left([\omega_t]_{\times}\Delta t\right)`,
      String.raw`\omega_{t+1}=\omega_t+\Delta\tau_t\Delta t`,
    ];

    for (const source of formulas) {
      expect(() => parseMathExpression(source, 'tex')).not.toThrow();
    }

    const serialized = JSON.stringify(parseMathExpression(formulas.join('+'), 'tex'));
    expect(serialized).toContain('"value":"ω"');
    expect(serialized).toContain('"value":"exp"');
    expect(serialized).toContain('"value":"×"');
    expect(serialized).toContain('"value":"Δ"');
    expect(serialized).toContain('"value":"τ"');
  });
});

describe('shared chat12-14 standard TeX math parsing', () => {
  it('parses the exact live predictor, bar, sup, norm, and sigma formulas', () => {
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
    ];

    for (const source of formulas) {
      expect(() => parseMathExpression(source, 'tex')).not.toThrow();
    }

    const serialized = JSON.stringify(parseMathExpression(formulas.join('+'), 'tex'));
    expect(serialized).toContain('"value":"φ"');
    expect(serialized).toContain('"value":"σ"');
    expect(serialized).toContain('"accent":"bar"');
    expect(serialized).toContain('"value":"sup"');
    expect(serialized).toContain('"value":"′"');
    expect(serialized).toContain('"value":"∥"');
  });

  it('keeps absolute value distinct from norm and scans nested scalable delimiters by depth', () => {
    const absolute = JSON.stringify(parseMathExpression(
      String.raw`\left|\hat{E}_k-E_k\right|`,
      'tex',
    ));
    const nestedNorm = JSON.stringify(parseMathExpression(
      String.raw`\left(\left\|d_{t+k}-c\right\|\right)`,
      'tex',
    ));
    const nestedAbsolute = JSON.stringify(parseMathExpression(
      String.raw`\left|\left(d-c\right)^2\right|`,
      'tex',
    ));
    const limitedSup = JSON.stringify(parseMathExpression(
      String.raw`\sup_x f(x)`,
      'tex',
    ));

    expect(absolute).toContain('"delimiter":"absolute"');
    expect(nestedNorm).toContain('"delimiter":"round"');
    expect(nestedNorm).toContain('"delimiter":"norm"');
    expect(nestedAbsolute).toContain('"delimiter":"absolute"');
    expect(limitedSup).toContain('"kind":"nary"');
    expect(limitedSup).toContain('"operator":"sup"');
    expect(limitedSup).toContain('"lower":{"kind":"text","value":"x"}');
  });
});
