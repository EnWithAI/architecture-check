# Configuration

`.architecture-check.json` in `--cwd` (or `--config <file>`). JSON only; unknown keys are usage errors (exit 2).
All keys are optional.

```json
{
  "model": "architecture/workspace.dsl",
  "graph": "graph.json",
  "system_name": "Shop",
  "ignore": ["legacy/**", "**/fixtures/**"],
  "ignore_containers": ["envoy-sidecar"],
  "external_sdks": { "@corp/payments-client": "Corp Payments", "@corp/identity/*": "Corp Identity" },
  "policy": { "fail_on_severity": "high", "fail_on_statuses": ["verified_static_fact"] }
}
```

| Key                       | Default                    | Meaning                                                                                                                  |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `model`                   | default locations          | Declared model, relative to `--cwd`. `--model` wins.                                                                     |
| `graph`                   | none                       | `impact-check graph --format json` output, relative to `--cwd`. `--graph` wins.                                          |
| `system_name`             | `As-built system`          | Name of the software system in `derive` output.                                                                          |
| `ignore`                  | `[]`                       | Globs (`*`, `**`, `?`) of repository paths that are not walked.                                                          |
| `ignore_containers`       | `[]`                       | As-built container names (or aliases) never reported as `container-undeclared`; listed in the report.                    |
| `external_sdks`           | `{}`                       | Extra package (or `prefix/*`) → vendor name entries for `external-system-undeclared`. Checked before the built-in table. |
| `policy.fail_on_severity` | `high`                     | `high`, `medium`, `low`, `info` or `never`.                                                                              |
| `policy.fail_on_statuses` | `["verified_static_fact"]` | Which statuses can fail the policy.                                                                                      |

## Element properties

| Property                       | DSL              | CALM `metadata` | Meaning                                                                                                       |
| ------------------------------ | ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| `commons.source`               | `"a, b"`         | string or array | Path, compose service, workload or Kubernetes Service name; for external systems an npm package or `prefix/*` |
| `commons.allowed-dependencies` | `"x, y"`         | array           | Element ids this element and its children may depend on                                                       |
| `commons.ignore`               | `"true"`         | `true`          | Exclude the element (and its children) from drift                                                             |
| `commons.external`             | `"true"`         | `true`          | A software system that is external (DSL: or tag `External`)                                                   |
| `technology`                   | element argument | string          | Declared technology (CALM has no field for it)                                                                |

A pull request can change the model and the config. When the check is required, protect `architecture/`,
`.architecture-check.json` and `.github/` with CODEOWNERS.
