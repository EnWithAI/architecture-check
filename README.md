# Architecture Check

**Does the architecture model committed in git still describe the code beside it? Offline, deterministic, and it never runs anything.**

Architecture Check compares a declared model (a [C4](https://c4model.com) model in a
[Structurizr DSL](https://docs.structurizr.com/dsl) subset, or a [FINOS CALM](https://calm.finos.org) architecture)
with an **as-built model** it derives from static evidence:

- **containers** from compose services, Dockerfiles and plain Kubernetes workloads (Services resolve as aliases);
- **components** and **import relationships** from the JS/TS module graph that
  [Impact Check](https://github.com/enwithai/impact-check) exports (`impact-check graph`);
- **configuration relationships** from compose `depends_on`/`links` and host names in environment values;
- **external systems** from vendor SDK imports (Stripe, AWS, OpenAI, …);
- **API descriptions** (OpenAPI, AsyncAPI) and who owns them.

It then reports drift: undeclared containers and components, declared elements whose source no longer exists,
undeclared dependencies, dependencies that break a declared boundary, declared relationships with no static evidence,
unowned API descriptions, technology mismatches and undeclared vendor SDKs.

Every finding has a `status` — `verified_static_fact`, `hypothesis` or `unknown` — plus evidence (file and line), a
provenance and a `recommended_human_action`. A declared relationship with no evidence is **unknown**, never "absent":
runtime calls are invisible to static analysis. There is no architecture score.

`derive` writes the as-built model as Structurizr DSL or CALM 1.3 JSON, so you can start a model from the code, render
it in Structurizr, or compare it with `calm diff`.

> Status: **early release** (`0.1.0`, pre-1.0, report schema 1.0). Published on npm as
> [`@enwithai/architecture-check`](https://www.npmjs.com/package/@enwithai/architecture-check); see [Install](#install).

## 60-second demo

Requires Node.js 22, 24 or ≥ 26.

```bash
git clone https://github.com/enwithai/architecture-check.git && cd architecture-check
npm ci --ignore-scripts && npm run build
cd examples/demo && node ../../dist/cli/main.js check --graph graph.json
```

The exit code is `4`: the demo's web container imports the shared library although the model allows it to depend on
the API only. The report matches [`examples/demo/output/architecture-check-report.md`](examples/demo/output/architecture-check-report.md)
byte for byte (also [JSON](examples/demo/output/architecture-check-report.json) and
[SARIF](examples/demo/output/architecture-check-report.sarif)). An excerpt:

```text
### 🔴 high · `boundary-violation` · verified
`shop.web -> shop.shared` — shop.web depends on shop.shared, which commons.allowed-dependencies of shop.web does not allow
- `web/src/cart/cart.ts:1` (graph) `imports shared/src/money.ts`

### 🟠 medium · `relationship-undeclared` · verified
`shop.api.orders -> shop.shared` — shop.api.orders depends on shop.shared, and no declared relationship covers it
```

The as-built model of the same repository: [`as-built.dsl`](examples/demo/output/as-built.dsl),
[`as-built.calm.json`](examples/demo/output/as-built.calm.json).

## Install

```bash
npm install --global @enwithai/architecture-check
architecture-check --help
```

To build from source instead:
`git clone https://github.com/enwithai/architecture-check.git && cd architecture-check && npm ci --ignore-scripts && npm run build`.

Uninstall with `npm uninstall --global @enwithai/architecture-check`. Architecture Check writes nothing outside the
output you ask for. No account, token, telemetry or network access. One runtime dependency (`yaml`).

## Usage

```bash
architecture-check derive --format dsl  --output architecture/workspace.dsl   # start a model from the code
architecture-check derive --format calm --graph graph.json                    # CALM 1.3, with components
impact-check graph --format json --output graph.json                          # module graph (Impact Check ≥ 0.3.0)
architecture-check analyze --graph graph.json                                 # report, exit 0
architecture-check check   --graph graph.json --format sarif --output ac.sarif # policy: exit 4 on failure
architecture-check check   --impact-check impact-check-report.json            # mark findings introduced by a PR
architecture-check rules | schema
```

The model is found at `--model`, the config `model`, or the first of `architecture/workspace.dsl`,
`architecture/calm.json`, `architecture/architecture.json`, `workspace.dsl`, `docs/architecture/workspace.dsl`,
`docs/architecture/calm.json`.

| Exit code | Meaning                                                          |
| --------- | ---------------------------------------------------------------- |
| 0         | OK (`check`: policy passed)                                      |
| 1         | Internal error                                                   |
| 2         | Usage or configuration error                                     |
| 3         | Input error (no model; unreadable or wrong-version graph/report) |
| 4         | Policy failure (`check` only)                                    |

The default policy fails only on **verified high-severity** findings: an unusable or unsafe model, or a verified
boundary violation. Hypotheses and unknowns never block unless you opt in ([docs/CONFIG.md](docs/CONFIG.md)).

## Tying the model to the code

Add `commons.source` to each element. Then matches are facts, and findings can be verified:

```
api = container "Orders API" "" "Node.js" {
    properties {
        "commons.source" "services/api"               // path, or a compose service / workload name
        "commons.allowed-dependencies" "shop.db"      // optional boundary
    }
}
```

`"commons.source" "."` is the repository root. A single-package repository (one root `package.json`, no compose,
Dockerfile, Kubernetes or workspaces) is derived as one container with source `.`.

In CALM, put the same keys in a node's `metadata`. Without `commons.source`, elements are matched by name and the
findings that rest on those matches are hypotheses. `commons.ignore` excludes an element.

## Rules

| Rule                         | Status      | Severity                           |
| ---------------------------- | ----------- | ---------------------------------- |
| `model-invalid`              | verified    | high                               |
| `model-reference-invalid`    | verified    | medium                             |
| `model-stale-reference`      | verified    | low                                |
| `container-undeclared`       | verified¹   | medium                             |
| `element-source-missing`     | verified    | medium                             |
| `component-undeclared`       | hypothesis  | low                                |
| `relationship-undeclared`    | verified²   | medium (low to an external system) |
| `boundary-violation`         | verified²   | high (medium as hypothesis)        |
| `relationship-unobserved`    | **unknown** | info                               |
| `interface-unowned`          | verified¹   | medium                             |
| `technology-mismatch`        | hypothesis  | low                                |
| `external-system-undeclared` | hypothesis  | low                                |

¹ hypothesis unless every declared container has `commons.source` (for `interface-unowned`, also when the model
declares no container). ² hypothesis unless the evidence is an import or
compose dependency and both ends are mapped by `commons.source`. Details: [docs/SPEC.md](docs/SPEC.md).

## What it will not do

It does not run Helm, Kustomize or Terraform; it does not follow `!include`, `!script` or `workspace extends`; it does
not build component graphs for languages other than JS/TS (yet); it does not discover anything at run time; it does
not change your model. Each gap is listed in the report's `coverage_limitations`. Enterprise-wide, continuously
updated architecture views are out of scope.

## GitHub Action

```yaml
on: pull_request
permissions:
  contents: read
jobs:
  architecture:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: enwithai/architecture-check@<release-sha>
        with:
          fail-on-policy: "false" # report only
```

See [docs/ACTION.md](docs/ACTION.md) (inputs, outputs, security model).

## Documentation

[SPEC](docs/SPEC.md) · [CONFIG](docs/CONFIG.md) · [ACTION](docs/ACTION.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) ·
[THREAT_MODEL](docs/THREAT_MODEL.md) · [SECURITY](SECURITY.md) · [CONTRIBUTING](CONTRIBUTING.md) ·
[CHANGELOG](CHANGELOG.md)

## License

MIT © EnWithAI Technologies. See [LICENSE](LICENSE), [NOTICE](NOTICE.md), [ATTRIBUTION](ATTRIBUTION.md) and
[TRADEMARKS](TRADEMARKS.md).

---

<sub>An EnWithAI Engineering Commons tool · offline · no code executed · no model used · [crewpe.ai](https://crewpe.ai)</sub>
