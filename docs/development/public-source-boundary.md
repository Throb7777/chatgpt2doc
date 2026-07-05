# Public Source Boundary

This project has two separate release artifacts:

1. Public source archive for GitHub/source review under the project's noncommercial license.
2. Chrome/Edge extension ZIPs for browser installation or store submission.

## Include in public source

- `src/`
- `tests/`
- `public/`
- `native/wps-helper/` source and scripts, excluding `dist/`
- `scripts/` release, QA, and asset-generation scripts
- `docs/USAGE.md`
- `docs/store/`
- `docs/development/`
- `README.md`
- `README.zh-CN.md`
- `PRIVACY.md`
- `LICENSE`
- `THIRD_PARTY_NOTICES.md`
- `package.json`
- `package-lock.json`
- TypeScript, ESLint, Vitest, and WXT config files

## Exclude from public source

- Git metadata and Codex-local state: `.git/`, `.agents/`, `.codex/`
- Reference-extension private material: `.reference-private/`, `*.crx`
- Build/dependency output: `node_modules/`, `.output/`, `.wxt/`, `dist/`, `coverage/`
- Native helper binaries: `native/wps-helper/dist/`
- Local release artifacts: `release/`
- Local temp artifacts: `.tmp/`, `tmp/`, `artifacts/local/`
- Historical QA binaries/screenshots: `docs/qa-artifacts/`, `docs/qa-screenshots/`
- Internal governance and reference-analysis material: `AGENTS.md`, `PROJECT_PLAN.md`, `PROGRESS.md`, `REFERENCE_ANALYSIS.md`, `docs/reference/`, and milestone diagnosis documents matched by `.releaseignore`
- Secrets and credentials: `.env*`, `*.pem`, `*.key`

## Rationale

The public source should be buildable, reviewable, and license-complete without exposing private chats, local machine paths, reference-extension packages, historical exported documents, or generated browser packages.

## Local governance exception

Historical RC ZIPs and replaceable temporary output are removed before public
publication. QA evidence that is still consumed by a verification command or
contains non-reproducible manual acceptance remains local and excluded from the
public source archive.
