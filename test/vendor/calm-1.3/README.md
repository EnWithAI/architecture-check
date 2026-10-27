# Vendored CALM 1.3 meta schemas (test-only)

Copies of `calm.json`, `core.json`, `control.json`, `flow.json` and `interface.json` from
`https://calm.finos.org/release/1.3/meta/`, retrieved 2026-10-27, unmodified. They belong to the FINOS
Architecture as Code project ([finos/architecture-as-code](https://github.com/finos/architecture-as-code)) and are
licensed under the Apache License 2.0 (Copyright FINOS / the Architecture as Code contributors).

They are used only by `test/acceptance/acceptance.test.ts` to validate Architecture Check's CALM output offline. They
are not part of the npm package (`files` in package.json lists `dist/` and `schema/` only). See NOTICE.md.
