# Contributing to Architecture Check

Thanks for helping! Architecture Check aims to stay **small, deterministic and honest** about what it knows.

## Ground rules

- Every finding needs evidence (path and line, or a directory), a `status` (`verified_static_fact` only for
  structural facts) and a `recommended_human_action`. Missing evidence is `unknown`, never "absent". Prefer a coverage
  limitation over guessing.
- Do not re-implement what CALM tooling, Structurizr or dependency-cruiser already do (rendering, model-to-model
  diff, module resolution). Read their formats instead.
- Never execute or fetch anything named in a model or repository. No network access, telemetry or child processes.
  New runtime dependencies need an issue first (one is allowed today: `yaml`).
- Fixtures must be **synthetic**. Never commit real or client architectures, secrets or personal data.
- Report schema changes must bump `schema_version` and update `schema/` and `src/types.ts` together.
- **Rule changes need fixtures first:** add or update an expectation in `test/acceptance/expected/` (or a unit case),
  watch it fail, then implement.

## Development

```bash
npm ci --ignore-scripts
npm run check:all                     # typecheck, lint, format check, build, tests with coverage
node scripts/license-audit.mjs --all
node scripts/generate-demo-output.mjs # after changing report output; commit the updated samples
```

## Pull requests

- Keep PRs focused; include tests that assert behavior.
- Describe user-visible changes in `CHANGELOG.md` under "Unreleased".
- By contributing you agree your contribution is licensed under the MIT License.

## Licensing of contributions and attribution

- Contributions are accepted under this repository's MIT License, inbound = outbound. By opening a pull request you
  confirm you have the right to submit the work under that license.
- Do not paste code, text or diagrams from other projects or publications. If third-party material is genuinely
  needed, open an issue first; it must keep its original license notice and be listed in [NOTICE.md](NOTICE.md).
- New source files start with `// SPDX-License-Identifier: MIT` (or `#` for YAML and shell).
- Do not add framework (CLEAR/TRACE) or product (CrewPE) claims unless
  [commons-provenance.yaml](commons-provenance.yaml) records an evidenced relationship. See
  [ATTRIBUTION.md](ATTRIBUTION.md).
- AI-assisted contributions are welcome. You are responsible for reviewing them and for their licensing; mention
  significant AI assistance in the PR description.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
