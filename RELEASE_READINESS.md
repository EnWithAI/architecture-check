# Release readiness — Architecture Check 0.1.0-alpha.0

Date: 2026-10-27 · Branch `alpha/architecture-check-0.1` · **Verdict: READY FOR HUMAN REVIEW** (not published; no
remote repository; publication needs explicit approval).

## Verified (commands run on 2026-10-27, Node v25.9.0)

| Check                | Command                                                         | Result                                                                                                       |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Full gate            | `npm run check:all`                                             | exit 0: typecheck, lint, format, build; 9 files / 79 tests passed; lines 97.38%, branches 87.07%             |
| Acceptance A1–A14    | `npx vitest run test/acceptance`                                | all pass. Expected findings, DSL and CALM files were written by hand before the code (see "Process note")    |
| CALM validity        | acceptance A10                                                  | derived CALM validates against the vendored CALM 1.3 meta schemas                                            |
| Round trip           | `test/rendering.test.ts`                                        | derived DSL and CALM, read back as the declared model, give zero findings                                    |
| Impact Check interop | `test/interop.test.ts`                                          | the published `impact-check graph` 0.3.0 output for A4 equals the hand-written graph; same findings          |
| Licenses             | `node scripts/license-audit.mjs` / `--all`                      | production: 1 package (`yaml`, ISC); all: MIT 81, ISC 4, BSD-3-Clause 1, Apache-2.0 1; disallowed 0          |
| Package              | `npm pack --dry-run`                                            | 75 files, 61.2 kB (dist, schema, docs)                                                                       |
| Clean install        | pack → install the tarball in an empty directory → demo `check` | works; 2 packages installed; exit 4; output identical to `examples/demo/output/architecture-check-report.md` |
| Quickstart           | `test/quickstart.test.ts` (built CLI, separate process)         | demo reproduces all five committed samples byte for byte                                                     |

## Gate checklist (PHASE_GATES.md)

- [x] P0: Phase 0 overlap audit (docs/SPEC.md §2): CALM CLI 1.66.0 (`validate`, `diff`: model ↔ model), CALM
      LLM discovery skill, CALMGuard, Structurizr, dependency-cruiser, ArchUnit/ts-arch. Overlap well under 80%.
      No maintainers contacted. Name provisional; `@enwithai/architecture-check` not checked on npm/GitHub yet.
- [x] P1: JSON Schema (`schema/`), fixtures with expected results, CLI help and exit contract, threat model, evidence
      on every finding (or `unknown` with reason).
- [x] P2: observed vs. inferred vs. declared provenance; deterministic output (test); no suggestion presented as
      executed.
- [x] P3: gate commands above; adversarial fixture A9 (unsafe DSL, crafted names, symlinks, token and URL credentials,
      YAML bomb); clean install; dependency/licence review.
- [~] P4: Action implemented and tested in-process; least privilege, env-passed inputs, `pull_request` only.
  **Not run on GitHub runners** (no remote).
- [x] P5: README with a 60-second demo, SPEC, CONFIG, ACTION, ARCHITECTURE, THREAT_MODEL, SECURITY, CONTRIBUTING,
      CODE_OF_CONDUCT, CHANGELOG, LICENSE, NOTICE, ATTRIBUTION, TRADEMARKS, REFERENCES, provenance file, issue/PR
      templates, CI workflow (actions pinned by SHA). Demo output audited by hand: 4/4 findings point at the correct
      file and line; counts (7 declared, 8 as-built elements, 6 relationships) correct.
- [ ] P6: STOP. Repository creation, push, CI, Action self-test and npm publication each need explicit approval.

## Process note

Fixtures and expected results (A1–A14, `a1.dsl`, `a10.dsl`, `a10.calm.json`) were written before the source code in
the same session, but there was no commit between them, so there is no recorded red run as in the sibling repositories.
During implementation two spec details were added before the code ran (always-present `static-analysis-only`
limitation; A11 snippets in the model's own format) and recorded in SPEC.md. Every expected file passed on the first
run of the implementation without being changed.

## Known limitations and risks

- JS/TS only for components and imports; other languages give container-level results plus a limitation.
- Helm, Kustomize and Terraform are not rendered; Kubernetes is read as plain YAML only.
- The DSL reader is a subset (no `!include`, no deployment model, no `!element` extensions); skipped statements are
  listed.
- Name matching, directory components, technology families and vendor tables are heuristics (all hypotheses).
- No independent human review yet of rule wording, severities and default policy.
