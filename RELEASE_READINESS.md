# Release readiness — Architecture Check 0.2.1

Date: 2026-10-29 · Branch `release/v0.2.1` · **Verdict: READY FOR HUMAN REVIEW**. Release PR requested by the user
on 2026-10-29; tag, GitHub release and npm publish (by the user, 2FA) each need approval.

## 0.2.1 (2026-10-29, Node v25.9.0)

Changes since 0.2.0: D-103 (the walk honours `.gitignore` and `.git/info/exclude`; new `gitignored-skipped`
limitation; `respect_gitignore` config), merged in EnWithAI/architecture-check#7 (`54bf3d1`). Found by running
Commons Check 0.1.1 on the Engineering Commons workspace. Report schema stays `1.1` (limitation codes are free strings).

| Check         | Command                                                         | Result                                                                                                     |
| ------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Full gate     | `npm run check:all`                                             | exit 0: typecheck, lint, format, build; 9 files / 85 tests passed; lines 97.36%, branches 87.88%           |
| Licenses      | `node scripts/license-audit.mjs` / `--all`                      | production: 1 package (`yaml`, ISC); all: MIT 81, ISC 4, BSD-3-Clause 1, Apache-2.0 1; disallowed 0        |
| Package       | `npm pack --dry-run`                                            | 77 files, 64.7 kB; local pack shasum `3b41634b6fdde91129cc95bbc80933a8d9eac5fd` (from this branch, no tag) |
| Clean install | pack → install the tarball in an empty directory → demo `check` | works; 2 packages installed; `--version` 0.2.1; exit 4; output identical to the committed sample           |
| Consumer run  | tarball build, `derive` on the Engineering Commons workspace    | 0 as-built elements (0.2.0: 8 from test fixtures); `gitignored-skipped` lists 10 paths                     |
| CI on GitHub  | EnWithAI/architecture-check#7                                   | 5 checks green                                                                                             |

---

# Release readiness — Architecture Check 0.2.0 (history)

Date: 2026-10-28 · Branch `release/v0.2.0` · **Verdict: READY FOR HUMAN REVIEW**. npm release of 0.2.0 requested by
the user on 2026-10-28 (version and report schema 1.1 chosen by the user); the user publishes with 2FA.

## 0.2.0 (2026-10-28, Node v25.9.0)

Changes since 0.1.0: D-100 (root package as a container, `commons.source "."`), D-101 (`interface-unowned` is a
hypothesis with no declared containers), D-102 (report schema 1.1), the `action-clean-install` CI job. Found by the
first consumer run, EnWithAI/impact-check#4.

| Check            | Command                                                         | Result                                                                                                             |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Full gate        | `npm run check:all`                                             | exit 0: typecheck, lint, format, build; 9 files / 83 tests passed; lines 97.43%, branches 87.59%                   |
| Acceptance       | `npx vitest run test/acceptance`                                | A1–A16 pass (A15 single-package repository, A16 context-level model)                                               |
| Licenses         | `node scripts/license-audit.mjs` / `--all`                      | production: 1 package (`yaml`, ISC); all: MIT 81, ISC 4, BSD-3-Clause 1, Apache-2.0 1; disallowed 0                |
| Package          | `npm pack --dry-run`                                            | 75 files, 62.5 kB                                                                                                  |
| Clean install    | pack → install the tarball in an empty directory → demo `check` | works; 2 packages installed; exit 4; output identical to `examples/demo/output/architecture-check-report.md`       |
| Consumer run     | fixed build on Impact Check with `commons.source "."`           | container mapped by source; 11 elements, 31 relationships, 22 API descriptions owned; 0 findings; no ignore needed |
| Action on GitHub | `action-clean-install` / `action-self-test` (#4, #5)            | green; the action's own install step adds only `yaml`                                                              |

---

# Release readiness — Architecture Check 0.1.0 (history)

Date: 2026-10-27 · Branch `alpha/architecture-check-0.1` · Verdict at the time: READY FOR HUMAN REVIEW (npm release
of 0.1.0 approved by the user on 2026-10-27, published by the user with 2FA).

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
- [x] P4: Action implemented and tested in-process; least privilege, env-passed inputs, `pull_request` only. Run on
      GitHub runners 2026-10-27 (see "GitHub verification"). The action's own dependency-install step was skipped in that
      run because the job had already run `npm ci`; the `action-clean-install` job exercised it on a runner on
      2026-10-28 (EnWithAI/architecture-check#4).
- [x] P5: README with a 60-second demo, SPEC, CONFIG, ACTION, ARCHITECTURE, THREAT_MODEL, SECURITY, CONTRIBUTING,
      CODE_OF_CONDUCT, CHANGELOG, LICENSE, NOTICE, ATTRIBUTION, TRADEMARKS, REFERENCES, provenance file, issue/PR
      templates, CI workflow (actions pinned by SHA). Demo output audited by hand: 4/4 findings point at the correct
      file and line; counts (7 declared, 8 as-built elements, 6 relationships) correct.
- [~] P6: Repository creation, push, CI and the Action self-test were approved by the user on 2026-10-27 and done.
  Release 0.1.0 (tag, GitHub release, npm) approved on 2026-10-27.

## GitHub verification (2026-10-27)

| Check                                                                       | Result                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository                                                                  | public `EnWithAI/architecture-check`, `main` = `7aad488`                                                                                                                                                                                                            |
| CI on `main` (run 40509609835)                                              | green on Node 22, 24 and 26: `npm ci`, `check:all`, license audit, `npm pack --dry-run`                                                                                                                                                                             |
| Action self-test (draft #1, empty commit, closed unmerged; run 40509753161) | passed: `uses: ./` on `examples/demo` with `graph: graph.json` reported 4 findings and policy fail (report-only, as expected for the demo); artifact `architecture-check-report` uploaded                                                                           |
| Action clean install (#4; run 40627428972, 2026-10-28)                      | passed: with `node_modules` removed after the build, the action's install step added 1 package (`yaml`; no dev dependencies); 4 findings, policy `failed`, status `ok`, JSON/Markdown/SARIF written; with `fail-on-policy: "true"` the step failed with exit code 4 |

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
