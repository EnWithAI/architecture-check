# Changelog

All notable changes are documented here. The format follows Keep a Changelog; versions follow SemVer (pre-1.0:
minor versions may break the report schema, which carries its own `schema_version`).

## Unreleased

- A single-package repository (root `package.json`, not a workspace root, and no compose, Dockerfile, Kubernetes,
  declared source or workspace-package container) is derived as one container with source `.` (origin
  `root-package`, evidence kind `package-manifest`) instead of an empty model (D-100).
- `commons.source "."` is valid: it maps a declared container to the repository root instead of reporting
  `element-source-missing` (D-100).
- `interface-unowned` is a hypothesis, not verified, when the model declares no containers (D-101).
- Acceptance scenarios A15 (single-package repository) and A16 (context-level model with an API description).

## 0.1.0 — 2026-10-27

First release (developed as 0.1.0-alpha.0; released directly as 0.1.0 so that plain `npm install` and `npx`
resolve it).

- `derive`: as-built model from compose services, Dockerfiles, plain Kubernetes workloads and Services, workspace
  packages and the Impact Check module graph (`impact-check graph`, graph schema 1.0); written as Structurizr DSL or
  FINOS CALM 1.3 JSON.
- `analyze` / `check`: declared model (Structurizr DSL subset or CALM JSON) compared with the as-built model; twelve
  rules (`model-invalid`, `model-reference-invalid`, `model-stale-reference`, `container-undeclared`,
  `element-source-missing`, `component-undeclared`, `relationship-undeclared`, `boundary-violation`,
  `relationship-unobserved`, `interface-unowned`, `technology-mismatch`, `external-system-undeclared`).
- Reports: JSON (schema 1.0), Markdown, SARIF 2.1.0. `--impact-check` marks findings introduced or pre-existing.
- GitHub Action (`action.yml`), report-only by default.
- Acceptance scenarios A1–A14 with hand-written expectations; interoperability test against Impact Check 0.3.0.
