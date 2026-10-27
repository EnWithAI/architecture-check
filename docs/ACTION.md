# GitHub Action

`action.yml` is a composite action. It installs the one runtime dependency (`yaml`) from the pinned lockfile with
`npm ci --omit=dev --ignore-scripts` (this step contacts the npm registry), then runs the built Architecture Check
(`dist/action/main.js`) with the runner's Node.js. Pin the action to a release **commit SHA**; release tags contain
the built `dist/`.

## Inputs and outputs

| Input               | Default                     |                                                                                                                            |
| ------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `working-directory` | `.`                         | Repository root for the model, graph, config and all paths.                                                                |
| `model`             | default locations           | Declared model, relative to `working-directory`.                                                                           |
| `graph`             | none                        | `impact-check graph --format json` output. Run Impact Check's graph step before this action to get components and imports. |
| `impact-check`      | none                        | Impact Check JSON report: marks findings `introduced` or `pre-existing`.                                                   |
| `config-path`       | `.architecture-check.json`  | Config relative to `working-directory`; defaults when absent.                                                              |
| `output-dir`        | `architecture-check-report` | Where `architecture-check-report.{json,md,sarif}` are written.                                                             |
| `fail-on-policy`    | `false`                     | `true` fails the step (exit 4) on a policy failure; otherwise a warning annotation.                                        |
| `on-error`          | `auto`                      | Tool/input errors: `auto` = fail when `fail-on-policy` is true, else warn; `fail`; `warn`. Usage errors always fail.       |

Absolute paths and `..` in path inputs are rejected. Outputs: `report-json`, `report-markdown`, `report-sarif`,
`findings`, `high-findings`, `policy` (`passed`/`failed`), `status` (`ok`/`error`).

## Security model

- Trigger on `pull_request` with `permissions: contents: read`. **Never** use `pull_request_target`: Architecture Check
  needs no secrets and would gain nothing from a write token.
- Inputs reach the program via environment variables, never shell interpolation.
- The program reads repository files and writes three report files plus the job summary. It starts no processes and
  makes no network calls. Model constructs that would run code or fetch content are refused.
- Fork pull requests behave the same as same-repository ones (read-only token, no secrets).
- Names from the repository are untrusted: the Markdown summary escapes them and neutralizes `@mentions`.
- A PR can change its own model, config and workflow. For a required check, protect them with CODEOWNERS.

## Optional: code-scanning alerts

Upload the SARIF file in a separate step that you add, with `security-events: write` on that job only.

## Verification status

The action is tested in-process (`test/action.test.ts`). The repository's CI runs it on the demo for pull requests
(`action-self-test`); **that run has not happened yet** (no remote repository).
