# Changelog

All notable changes are documented here. The format follows Keep a Changelog; versions follow SemVer (pre-1.0:
minor versions may break the report schema, which carries its own `schema_version`).

## Unreleased

## 0.2.1 — 2026-10-29

Fix from running Commons Check on the Engineering Commons workspace (EnWithAI/architecture-check#7).

- The repository walk honours `.gitignore` files and `.git/info/exclude` (D-103). Previously git-ignored directories,
  such as nested repositories or generated manifests, were walked and could put their Dockerfiles and compose
  services into the as-built model. Skipped paths are listed in the new `gitignored-skipped` limitation; config
  `respect_gitignore: false` restores the old walk. Matching runs in process; git is never executed.

## 0.2.0 — 2026-10-28

Fixes from the first consumer run (EnWithAI/impact-check#4).

- Report schema `1.1` (D-102): `origin` gains `root-package` and evidence `kind` gains `package-manifest`; nothing
  else changes.
- A single-package repository (root `package.json`, not a workspace root, and no compose, Dockerfile, Kubernetes,
  declared source or workspace-package container) is derived as one container with source `.` (origin
  `root-package`, evidence kind `package-manifest`) instead of an empty model (D-100).
- `commons.source "."` is valid: it maps a declared container to the repository root instead of reporting
  `element-source-missing` (D-100).
- `interface-unowned` is a hypothesis, not verified, when the model declares no containers (D-101).
- Acceptance scenarios A15 (single-package repository) and A16 (context-level model with an API description).
- CI: `action-clean-install` runs the action with no `node_modules`, so its own dependency-install step is tested on
  every pull request.

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
