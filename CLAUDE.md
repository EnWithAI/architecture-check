# CLAUDE.md — Architecture Check repository conventions

These conventions apply inside this repository. They never override the EnWithAI Engineering Commons launch pack
(internal workspace) (`../START_HERE.md`, `../MASTER_PROMPT.md`, `../PHASE_GATES.md`) or the user's explicit
instructions.

## Commands

- Install: `npm ci --ignore-scripts`
- Full gate: `npm run check:all` (typecheck → lint → format check → build → tests with coverage ≥ 80% lines)
- Licenses: `node scripts/license-audit.mjs` (production: `yaml` only) and `--all`
- Sample outputs: `npm run build && node scripts/generate-demo-output.mjs` (commit when output changes)

## Scope

Deterministic, offline drift checks between a declared architecture model (Structurizr DSL subset, CALM JSON) and the
as-built model from compose, Dockerfiles, plain Kubernetes, API descriptions and the Impact Check module graph. Out of
scope for 0.1: Helm/Kustomize/Terraform evaluation, non-JS/TS component graphs, AsyncAPI channel matching, Product
Check `as-built-spec` input, runtime discovery, writing to the model, portfolio views, scores.

## Invariants (tests enforce most of these)

- No network modules, `child_process`, `vm`, `eval` or dynamic `import()` in `src/` (`test/security.test.ts`).
- One runtime dependency (`yaml`, pinned, safe schema). Model constructs that run code or fetch content are refused.
- Findings need evidence, a status and a recommended action. Only structural facts may be `verified_static_fact`;
  missing evidence is `unknown`.
- Output is deterministic except `run_metadata`; arrays sorted; paths relative to `--cwd`.
- Repository-derived strings are redacted and escaped before rendering; environment values are never kept.
- Fixtures are synthetic only. Rule changes start with a failing expectation.

## Permission gates

Local commits on the work branch are fine. **Pushing, creating remotes/repos, publishing to npm, opening external
issues/PRs, or enabling third-party services requires explicit user approval for that specific action.**
