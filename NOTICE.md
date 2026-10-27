# NOTICE

Architecture Check
Copyright (c) 2026 EnWithAI Technologies

Architecture Check is licensed under the MIT License (see [LICENSE](LICENSE)). This NOTICE adds no conditions to that
license.

## Third-party material

Architecture Check contains no vendored source code in its package. It has **one runtime dependency**,
[`yaml`](https://github.com/eemeli/yaml) 2.9.1 (ISC, Copyright Eemeli Aro), installed by npm, not copied.

The repository (not the npm package) contains test-only copies of the FINOS CALM 1.3 meta schemas in
`test/vendor/calm-1.3/`, used to validate the CALM output offline:

| Material                      | Origin                                                                                                                                                     | License    | Copyright notice                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| `test/vendor/calm-1.3/*.json` | `https://calm.finos.org/release/1.3/meta/` ([finos/architecture-as-code](https://github.com/finos/architecture-as-code)), retrieved 2026-10-27, unmodified | Apache-2.0 | Copyright FINOS and the Architecture as Code contributors |

The Apache License 2.0 text is at <https://www.apache.org/licenses/LICENSE-2.0>. The upstream project's NOTICE applies
to those files.

The rule `technology-mismatch` uses a table of public container image names, and `external-system-undeclared` a
table of public npm package names (`src/derive/technology.ts`, `src/derive/vendors.ts`). These are names, not code.

## Trademarks

EnWithAI, CrewPE and related names are not licensed under the MIT License. See [TRADEMARKS.md](TRADEMARKS.md).
