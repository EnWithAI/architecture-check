# Architecture Check — behavior specification (0.1)

_Written before the implementation (design notes: `progress/DESIGN_NOTES_ARCHITECTURE_CHECK.md` in the workspace;
decisions D-079 to D-088, D-091 onward). Every statement here is either tested (§10) or listed as a limitation._

## 1. Problem and user

A team keeps an architecture model (C4 in Structurizr DSL, or FINOS CALM JSON) in the repository. Over time the code,
the Dockerfiles, the compose files and the Kubernetes manifests change and the model does not. Reviewers cannot tell
which boxes and arrows are still true.

Architecture Check answers: **does the architecture committed in git still describe the code committed next to it;
where not, what exactly differs, how do we know, and what should a human check?**

- `derive` writes an **as-built model** from static evidence (Structurizr DSL, CALM JSON or the report JSON).
- `analyze` / `check` compare the **declared model** with the as-built model and report **drift findings**.

It never rewrites the declared model; suggested changes are text in the report.

## 2. Relationship to existing tools (Phase 0 overlap audit, 2026-10-27)

| Tool                                                                                          | What it does                                                                                                              | Overlap                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FINOS CALM CLI (`@finos/calm-cli` 1.66.0, Apache-2.0)                                         | `validate` (architecture vs pattern/schema), `diff` (two CALM documents by `unique-id`), `generate`, `template`, `docify` | **Model ↔ model only.** `calm diff declared.json as-built.json` compares two documents but has no code evidence, no mapping from elements to files, no status vocabulary. Architecture Check produces the as-built CALM document that `calm diff` and `calm validate` can consume |
| CALM "architecture discovery" skill (docs/static/calm-skills in `finos/architecture-as-code`) | An LLM agent prompt that scans a codebase and proposes CALM nodes                                                         | Same goal for `derive`, but model-generated and non-deterministic. Architecture Check is deterministic and evidence-backed, and does not use a model                                                                                                                              |
| CALMGuard (`finos/architecture-as-code/calm-guard`, Apache-2.0)                               | LLM agents that assess compliance of a CALM model                                                                         | None: compliance of the model, not model ↔ code                                                                                                                                                                                                                                   |
| Structurizr (`structurizr/structurizr`, Apache-2.0; DSL, Lite, CLI)                           | Authoring, rendering and exporting C4 models                                                                              | None for drift. Architecture Check reads a DSL **subset** and writes DSL Structurizr can render                                                                                                                                                                                   |
| dependency-cruiser (used through `impact-check graph`)                                        | Module graph and forbidden-dependency rules                                                                               | Module-level rules. Architecture Check lifts edges to C4 elements declared in the model                                                                                                                                                                                           |
| ArchUnit / ts-arch                                                                            | Architecture rules as unit tests                                                                                          | Code ↔ rules in code, not code ↔ C4 model                                                                                                                                                                                                                                         |

Overlap is well below the 80 % threshold (Spec Check's rule), so a separate tool is justified. The upstream path is
interoperability: emit valid CALM 1.3 so `calm validate`/`calm diff` work on the output (§10, A10). No maintainers were
contacted.

## 3. Inputs

All inputs are local files. Paths in the report are relative to `--cwd` (the repository root) with `/` separators.

### 3.1 Repository walk

- Depth ≤ 20, at most 20,000 entries (`file-list-cap`). Skipped directories: `.git`, `node_modules`, `dist`, `build`,
  `coverage`, `.next`, `vendor`, `target`, and anything matching config `ignore` globs.
- Symbolic links are never followed (`symlink-skipped`). Files over 1 MiB are not parsed (`file-too-large`).
  Files that are not valid UTF-8 are not parsed (`file-not-utf8`).
- Classification by base name:

| Kind                 | Rule                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Dockerfile           | `Dockerfile`, `Containerfile`, `Dockerfile.*`, `*.Dockerfile`, `*.dockerfile`                                     |
| Compose file         | `(docker-)?compose(.<name>)?.y(a)ml`                                                                              |
| Helm chart           | a directory containing `Chart.yaml`: nothing under it is parsed (`helm-not-rendered`)                             |
| Kustomize            | `kustomization.y(a)ml`: plain resources beside it are parsed, overlays are not applied (`kustomize-not-rendered`) |
| Other IaC            | `*.tf`, `*.tofu`, `Pulumi.yaml`, `cdk.json`: not evaluated (`iac-not-evaluated`)                                  |
| Other YAML           | `*.yaml`/`*.yml`: every document is parsed; Kubernetes resources and API descriptions are recognized by content   |
| JSON API description | `*.json` whose base name contains `openapi`, `swagger` or `asyncapi` (case-insensitive)                           |

The declared model file and the files named by `--graph`/`--impact-check` are not classified.

YAML is parsed with the `yaml` package (D-082): YAML 1.2 core schema, unique keys, at most 100 alias expansions;
unknown tags (such as `!!js/function`) are never resolved, the value is read as plain data. A file that fails to parse is listed in `yaml-unparseable` and contributes nothing.

### 3.2 Deployment descriptors → as-built containers

1. **Compose services.** Every service of every compose file (files sorted by path, services by name) is a
   container named after the service. A service with the same name in several compose files is one container
   (override files). Fields read: `build` (string, or `context` + `dockerfile`), `image`, `depends_on` (list or map),
   `links` (`name` or `name:alias`), `environment` (map or `KEY=VALUE` list). The build context is resolved
   against the compose file's directory and must stay inside the repository (`path-outside-root` otherwise); it
   becomes the container's **source path**.
2. **Dockerfiles** not used by any compose build (`<context>/<dockerfile or "Dockerfile">`) are containers named
   after their directory's base name (`app` for the repository root); the directory is the source path.
3. **Kubernetes workloads** (`apps/v1` or `batch/v1`, kinds Deployment, StatefulSet, DaemonSet, Job, CronJob) are
   containers named by `metadata.name`, merged with a compose service of the same name. They have no source path.
   A **Service** whose `spec.selector` labels are all present in a workload's pod-template labels becomes an
   **alias** of that workload (used for host-name resolution and name matching).
4. **Root package** (D-100). When steps 1–3, declared source directories (§4) and workspace packages (§3.3) give no
   container, a root `package.json` that is not a workspace root (no `workspaces` field, no `pnpm-workspace.yaml`)
   is one container named after its `name` (`app` when it has none or does not parse), with source path `.`
   (`origin: "root-package"`, description `Root package`, evidence kind `package-manifest`). It applies with or
   without `--graph`. Like workspace packages, it is code, not a deployable unit, and never `container-undeclared`.

**Technology.** From the final stage of the Dockerfile (a `FROM` naming an earlier stage alias resolves to that
stage's image), else from compose `image`, else from the first workload container image. The image reference is
reduced to its repository path without registry, tag or digest, and mapped to a family (table in
`src/derive/technology.ts`: Node.js, Python, Java, Go, .NET, Ruby, PHP, Rust, Nginx, PostgreSQL, MySQL, MariaDB,
MongoDB, Redis, RabbitMQ, Kafka, Elasticsearch). Unknown or variable images (`FROM ${BASE}`, `alpine`, `scratch`)
give `null`. Containers whose family is a data store (PostgreSQL, MySQL, MariaDB, MongoDB, Redis, Elasticsearch)
have `node_type: "database"`, others `"service"`.

### 3.3 Module graph (`--graph`, optional)

The output of `impact-check graph --format json` (graph schema `"1.0"`, D-081). Other versions are rejected (exit 3).
Module paths must be relative to the same root as `--cwd`; module paths that do not exist on disk are counted in
`graph-path-mismatch`. Without `--graph`, there are no component-level or import-based results and the report has
`no-module-graph`.

- A module belongs to the container with the **longest source path** that contains it (`p` contains `x` when
  `x === p`, `x` starts with `p + "/"`, or `p === "."`).
- Only modules of kind `source` count. Edges with `type_only: true` are ignored (they have no runtime effect).
- **Workspace packages.** A `repository.workspace_packages` entry other than `.` whose path equals a container's
  source path adds the package name as an alias of that container. Any other package path that contains source
  modules not already in a container becomes a container named after the package (`origin: "workspace-package"`,
  description `Workspace package`). Such containers are never reported as `container-undeclared`: they are code, not
  deployable units.
- **Components.** For a container with source path `S`, the component root `R` is `S/src` if any module lies under
  it, else `S`. A component is a first-level directory under `R` that contains a source module; modules directly in
  `R` belong to no component.
- An import edge between modules in different containers is a **container relationship**; between different
  components of the same container, a **component relationship**. Status of the evidence: `graph` provenance →
  verified, `inferred` (workspace mapping) → hypothesis.
- **External systems.** `external_imports` whose package (`@scope/name` or `name`, subpaths removed; `node:` and
  Node built-ins ignored) is in the vendor table (`src/derive/vendors.ts`, extendable with config `external_sdks`)
  give an external system per vendor, used from the importing module's container.
- Containers with a source path but no source module in the graph, whose source path contains files of another
  language (`.py .go .java .kt .rb .php .cs .rs .scala .ex .exs`), are listed in
  `component-graph-language-unsupported` (D-086).

### 3.4 Configuration relationships

- Compose `depends_on` and `links` → container relationship, **verified** (`compose-dependency`).
- **Host names in configuration values** (compose `environment`, Kubernetes container `env[].value`): a value parsed
  as `scheme://[userinfo@]host[:port]…` or `host:port`, whose host equals another container's name or alias, gives a
  **hypothesis** relationship. The value is never stored or printed; the evidence names the variable only.

### 3.5 API descriptions

A YAML document or JSON file with a top-level `openapi`, `swagger` or `asyncapi` key is an **interface**
(`format`: openapi/asyncapi, `version`: the key's value). Its owner is the container with the longest source path
containing the file. Channel matching between AsyncAPI files is not in 0.1 (D-094).

### 3.6 Declared model

Located by `--model`, else config `model`, else the first existing file of: `architecture/workspace.dsl`,
`architecture/calm.json`, `architecture/architecture.json`, `workspace.dsl`, `docs/architecture/workspace.dsl`,
`docs/architecture/calm.json`. `.dsl` is Structurizr DSL; `.json` is CALM. None found → `analyze`/`check` exit 3 with
a hint to run `derive`. Larger than 1 MiB → exit 3.

Both formats become one declared IR: elements (`id`, `kind` person/software_system/container/component/
external_system, `name`, `technology`, `parent`, `line`, properties) and relationships (`from`, `to`, `line`).

**Element properties** (DSL `properties { "key" "value" }`, CALM `metadata` object or array of objects merged in
order):

| Key                            | Meaning                                                                                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commons.source`               | Where the element lives. Containers/components: a repository path, or a compose service/Kubernetes workload/Service name. External systems: an npm package name or `prefix/*`. DSL: comma-separated; CALM: string or array |
| `commons.allowed-dependencies` | Element ids this element (and its children) may depend on. DSL: comma-separated; CALM: array                                                                                                                               |
| `commons.ignore`               | `"true"`/`true`: excluded from drift                                                                                                                                                                                       |
| `commons.external`             | `"true"`/`true`: a software system that is external                                                                                                                                                                        |

**CALM mapping.** `nodes[]` (required) and `relationships[]`. `node-type` actor → person; system → software_system
(external with `commons.external`); ecosystem → external_system; `component` → component; every other type → container.
`composed-of` and `deployed-in` set the parent of each listed node when the container node is a software system (for
containers) or a container (for components); otherwise they are ignored. `connects` gives `source.node` →
`destination.node`; `interacts` gives actor → each listed node. `adrs[]` entries without a URL scheme are checked as
paths relative to the model file. The declared technology is the `technology` metadata key (CALM has no technology
field). Line numbers come from the first `"unique-id": "<id>"` occurrence.

**DSL subset.** Line-oriented statements, `//`, `#` and `/* */` comments, quoted strings with `\"`.

- Elements: `[id =] person|softwareSystem|container|component <name> [description] [technology] [tags] [{]`
  (technology only for container/component). In a block: `technology`, `description`, `tags`, `url`, `properties`,
  nested elements, relationships. `group "…" { }` and `enterprise { }` are transparent.
- Software systems tagged `External` (case-insensitive) or with `commons.external` are external systems.
- Relationships: `a -> b [description] [technology] [tags]`, and inside an element block `-> b` or `this -> b`.
- `!identifiers hierarchical` gives ids `parent.child`; references are resolved first as written, then relative to
  each enclosing scope (innermost first).
- `views`, `styles`, `configuration`, `branding`, `terminology`, `perspectives` blocks are skipped silently;
  `deploymentEnvironment` blocks are skipped (`dsl-deployment-ignored`).
- **Never evaluated:** `!script` and `!plugin` (block skipped, `model-invalid`), `!include` of a URL
  (`model-invalid`), `workspace extends` (`model-invalid`). `!include` of a local file is not followed
  (`dsl-include-not-followed`). `!docs`/`!adrs` paths are checked for existence. Every other `!` directive and
  unknown statement is skipped (`dsl-statement-ignored`).
- Unbalanced braces or an unterminated string make the model unusable (`model-invalid`).

### 3.7 Impact Check report (`--impact-check`, optional)

Report schema `"2.0"` only. When given, each finding gets `change_status`: `introduced` when any non-model evidence
path is a `changed_files[].path` with status other than `deleted`, else `pre-existing`.

## 4. Mapping declared ↔ as-built

In-scope declared elements: containers and components that are not ignored.

1. A declared container with `commons.source` maps through each value: an as-built container whose name or alias
   equals the value; else an as-built container whose source path equals the value (normalized: no `./`, no trailing
   `/`); else, if the value is an existing directory, a new as-built container with that source path
   (`origin: "declared-source"`, for code with no deployment descriptor). `.` is a valid value, the repository root
   (D-100): it maps to the container whose source path is `.` (a root Dockerfile or the root package), else to a new
   container with source path `.`, named after the root `package.json` `name` (origins `declared-source` and
   `root-package`) or `app`, created after workspace packages so that they keep their own containers (longest source
   path wins). Values that match nothing →
   `element-source-missing`. Match kind: `source`.
2. Declared containers without `commons.source` map by **name**: the normalized (lower case, letters and digits only)
   declared name or last id segment equals the normalized name or an alias of an unmapped as-built container. Match
   kind: `name` (findings resting on it are hypotheses).
3. Components map the same way to as-built components of their parent's mapped container: by `commons.source`
   (equal to the component path `R/<dir>`) or by name.
4. External systems map by `commons.source` package (exact or `prefix/*`), else by name containing one of the
   vendor's keys (match kind `name`).
5. Each as-built element maps to at most one declared element; ties go to the declared element whose id sorts first.

`complete_mapping` is true when every in-scope declared container has `commons.source`.

## 5. Rules

| Rule                         | Status                                          | Severity                           | Trigger                                                                                                                                          | Recommended human action                                                                              |
| ---------------------------- | ----------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `model-invalid`              | verified                                        | high                               | Model unusable (JSON/brace/string error, no `nodes`/`model`), or an unsafe construct (`!script`, `!plugin`, URL `!include`, `workspace extends`) | Fix the model; Architecture Check never evaluates these constructs                                    |
| `model-reference-invalid`    | verified                                        | medium                             | Duplicate element id; relationship endpoint or `commons.allowed-dependencies` entry not defined                                                  | Fix the reference                                                                                     |
| `model-stale-reference`      | verified                                        | low                                | CALM `adrs[]` relative path or DSL `!docs`/`!adrs` path does not exist                                                                           | Fix or remove the reference                                                                           |
| `container-undeclared`       | verified if `complete_mapping`, else hypothesis | medium                             | As-built container from a deployment descriptor with no declared container, not in `ignore_containers`                                           | Add it to the model (suggested snippet in the report), or ignore it in the config                     |
| `element-source-missing`     | verified                                        | medium                             | A `commons.source` value of a container or component matches nothing                                                                             | Update the mapping or remove the element                                                              |
| `component-undeclared`       | hypothesis                                      | low                                | `--graph` given, the declared parent container declares ≥ 1 component, and an as-built component maps to none                                    | Decide whether the component belongs in the model                                                     |
| `relationship-undeclared`    | see below                                       | medium (low to an external system) | An observed relationship between mapped elements not covered by a declared relationship                                                          | Declare it, or remove the dependency                                                                  |
| `boundary-violation`         | see below                                       | high if verified, else medium      | An observed relationship from an element with `commons.allowed-dependencies` (or its child) to an element not allowed                            | Remove the dependency or change the declared rule                                                     |
| `relationship-unobserved`    | **unknown**                                     | info                               | A declared relationship between mapped observable elements with no observed relationship covering it                                             | Confirm it still exists; runtime calls and deploy-time configuration are invisible to static analysis |
| `interface-unowned`          | verified if `complete_mapping`, else hypothesis | medium                             | An API description not inside any mapped container's source path                                                                                 | Attach it to its owning container (`commons.source`)                                                  |
| `technology-mismatch`        | hypothesis                                      | low                                | The declared technology names a known family and none equals the as-built family                                                                 | Update the declared technology or check the build (multi-stage images, sidecars)                      |
| `external-system-undeclared` | hypothesis                                      | low                                | A vendor SDK is imported from a mapped container, and no declared external system maps to the vendor                                             | Declare the external system                                                                           |

**`interface-unowned` with no declared containers** (D-101). When the model declares no in-scope container
(a context-level model), `complete_mapping` is vacuously true; `interface-unowned` is then a hypothesis, not
verified. The finding is still reported.

**Lifting.** Each end of an as-built relationship is replaced by the deepest declared element mapped to it: the
mapped component if its as-built component is mapped, else the mapped container; external systems map as in §4. An
end with no mapped element drops the relationship (the unmapped container is reported by `container-undeclared`;
an unmapped external system by `external-system-undeclared`). Relationships whose ends lift to the same element, or
to an element and its ancestor, are internal and dropped.

**Coverage.** A declared relationship `a → b` covers an observed relationship `u → v` when `a` is `u`, an ancestor
or a descendant of `u`, and the same holds for `b` and `v`. A declared `a → b` is observed when some observed `u → v`
has `u` in `a`'s subtree (itself or descendants) and `v` in `b`'s.

**Status of relationship findings.** `verified_static_fact` when at least one evidence item is verified (import with
`graph` provenance, `depends_on`, `links`) **and** both ends are mapped by `source`; otherwise `hypothesis`.
`relationship-unobserved` applies to a declared `a → b` when `a` is a mapped container or component and `b` is a
mapped container or component, or any non-ignored external system (an external system is observed only through an
import mapped to it). A relationship involving a person or a software system is never reported as unobserved. `relationship-undeclared` is not reported for an edge that has a
`boundary-violation`, or whose target is an external system with no declared counterpart (that is
`external-system-undeclared`).

Each finding has a deterministic id `ACF-` + the first 10 hex digits (upper case) of SHA-256 over the rule id and a
location fingerprint without line numbers. Evidence lists hold at most 5 items, sorted, with `evidence_total` giving
the full count.

Every report carries the limitation `static-analysis-only`: runtime calls, service discovery and deploy-time
configuration are invisible, so missing evidence is `unknown`, never absence.

**Default policy (`check`):** fail on `verified_static_fact` findings of severity `high` (D-064 pattern). Configurable.

## 6. Outputs, commands and exit codes

```
architecture-check derive  [--format dsl|calm|json] [--graph <file>] [options]
architecture-check analyze [--model <file>] [--graph <file>] [--impact-check <file>] [--format markdown|json|sarif] [options]
architecture-check check   (as analyze, then the policy: exit 4 on failure)
architecture-check rules | schema
```

Common options: `--cwd`, `--config` (default `.architecture-check.json`), `--output`, `--on-error fail|pass`,
`--no-branding`, `--quiet`, `--help`, `--version`. Exit codes as the siblings: 0 ok, 1 internal error, 2 usage or
configuration error, 3 input error (no model, unreadable or wrong-version graph/report), 4 policy failure.

**Report JSON** (`schema/architecture-check-report.schema.json`, schema `"1.1"`; D-102): `schema_version`, `kind`, `tool`,
`declared_model` (`path`, `format`, `schema`, `sha256`, `elements`, `relationships`; `null` for `derive`), `inputs`
(`graph`, `impact_check`: path, schema version, sha256, or `null`), `as_built` (`elements`, `relationships`,
`interfaces`), `mapping`, `findings`, `summary`, `policy`, `coverage_limitations`, `run_metadata` (`generated_at`,
`tool_version`, `node_version`, `duration_ms`). There is no score field. Arrays are sorted; output is byte-identical for
identical input apart from `run_metadata`.

**Structurizr DSL output.** Four-space indentation, `!identifiers hierarchical`, one software system named by config
`system_name` (default `As-built system`, id `system`) containing containers and their components; external systems
as top-level `softwareSystem` with tag `External`; relationships after the elements, sorted. Every element carries
`properties { "commons.source" "…" }`: the source path, else the container name (compose service or workload), the
component path, or the external system's packages (comma-separated). A container's description is its descriptor
paths (Dockerfile, compose, Kubernetes files; sorted, comma-separated), or `Workspace package`/`Declared source`; an
external system's is `npm: <packages>`; components have none. A relationship's description lists its evidence labels,
sorted and comma-separated: `depends_on`, `links`, `env <VARIABLE>`, `imports`. Containers, then components, then
relationships are sorted by id. The views block has a system-context and a container view with `autolayout lr`.
The exact layout is fixed by `test/acceptance/expected/a1.dsl` and `a10.dsl`. Names are quoted with `"` and `\` escaped and control
characters removed, so a crafted name cannot inject DSL. Identifiers are generated (`[a-z0-9_]`), never copied.

**CALM output.** `$schema` `https://calm.finos.org/release/1.3/meta/calm.json`; nodes (system → `system`, containers →
`service`/`database`, components → `component`, externals → `ecosystem`), `composed-of` relationships for containment,
`connects` for observed relationships (`unique-id` `<from>-composed-of` / `<from>-connects-<to>`, descriptions as in
the DSL), node `metadata` with `technology` (when known) and `commons.source`, and document metadata
`{"commons.generated-by": "architecture-check"}`. Nodes are sorted by `unique-id`; `composed-of` relationships come
first. The exact layout is fixed by `test/acceptance/expected/a10.calm.json`. It validates against the CALM 1.3 schemas
(tested offline against a vendored copy).

**Markdown** (starts with an untrusted-data notice; repository strings as code spans) and **SARIF 2.1.0** are
renderings of the JSON report.

## 7. Configuration (`.architecture-check.json`)

`model`, `graph`, `system_name`, `ignore` (globs), `ignore_containers` (names), `external_sdks` (package or `prefix/*`
→ vendor name), `policy.fail_on_severity` (`high`, `medium`, `low`, `info`, `never`), `policy.fail_on_statuses`.
Unknown keys are a usage error. Ignored containers are listed in the report.

## 8. Non-goals (0.1)

Helm/Kustomize/Terraform evaluation; non-JS/TS component graphs; AsyncAPI channel matching; Product Check
`as-built-spec` input (D-095); runtime discovery or network access; writing to the declared model; enterprise
portfolio views, live sync, incident correlation (CrewPE); scores.

## 9. Threat model (summary; detail in `docs/THREAT_MODEL.md`)

DSL code execution and remote includes (refused, never evaluated); YAML bombs and custom tags (core schema, alias
limit, size limit); secrets in environment values (never stored; only variable names; token redaction on every
output string); path escape (symlinks not followed, build contexts and model references confined to the root);
DSL/Markdown/SARIF injection through names (escaping, generated identifiers); resource exhaustion (caps listed in §3.1,
5,000 findings, 5 evidence items per finding).

## 10. Acceptance scenarios (hand-computed before the implementation)

| ID  | Setup                                                                                                                                                                                                                                                                                                          | Expected                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Compose: `web` and `api` (Dockerfiles), `db` (`postgres:16`); `web` depends on `api`, `api` on `db`, `api` has `DATABASE_URL` pointing at `db`; DSL model matches, every container with `commons.source`                                                                                                       | 0 findings; `no-module-graph`; `derive --format dsl` equals `expected/a1.dsl`                                                                                                                                                                             |
| A2  | A1 + compose service `worker`                                                                                                                                                                                                                                                                                  | 1 `container-undeclared` (verified, medium)                                                                                                                                                                                                               |
| A3  | A1 + declared container `billing` with source `services/billing` (absent)                                                                                                                                                                                                                                      | 1 `element-source-missing` (verified, medium)                                                                                                                                                                                                             |
| A4  | A1 + declared library container `shared` (source `shared`, no Dockerfile), declared component `api.orders`, `web` allowed only `api`; graph: `web/src/cart` imports `shared` (plus a type-only and a test import that must be ignored), `api/src/orders` imports `shared`, `api/src/payments` imports `stripe` | `boundary-violation` web → shared (verified, high); `relationship-undeclared` api.orders → shared (verified, medium); `external-system-undeclared` Stripe (hypothesis, low); `component-undeclared` `api/src/payments` (hypothesis, low); `check` exits 4 |
| A5  | A1 + declared external Stripe (`commons.source` `stripe`) and `api → Stripe`; no graph                                                                                                                                                                                                                         | 1 `relationship-unobserved` (unknown, info)                                                                                                                                                                                                               |
| A6  | A1 + `api/openapi.yaml` and `contracts/orders.yaml` (OpenAPI 3.1)                                                                                                                                                                                                                                              | 1 `interface-unowned` (verified, medium) for `contracts/orders.yaml`                                                                                                                                                                                      |
| A7  | A1 with `api/Dockerfile` `FROM python:3.12-slim`, declared `Node.js`                                                                                                                                                                                                                                           | 1 `technology-mismatch` (hypothesis, low)                                                                                                                                                                                                                 |
| A8  | Helm chart and Terraform beside one declared Dockerfile container                                                                                                                                                                                                                                              | 0 findings; `helm-not-rendered`, `iac-not-evaluated`, `no-module-graph`                                                                                                                                                                                   |
| A9  | Adversarial: `!script`, URL `!include`, crafted names, symlink out of the root, a token and URL credentials in environment values                                                                                                                                                                              | 2 `model-invalid`; nothing executed or fetched; names escaped in DSL/Markdown/SARIF; symlink limitation; secrets in no output                                                                                                                             |
| A10 | A4 repository; `derive`                                                                                                                                                                                                                                                                                        | DSL and CALM equal `expected/a10.dsl` and `expected/a10.calm.json`; the CALM output validates against CALM 1.3                                                                                                                                            |
| A11 | A4 with the model as CALM (`unique-id`s equal to the DSL ids)                                                                                                                                                                                                                                                  | Identical to A4 except CALM snippets                                                                                                                                                                                                                      |
| A12 | A4 + Impact Check report in which `web/src/cart/cart.ts` changed                                                                                                                                                                                                                                               | The boundary violation is `introduced`, the other findings `pre-existing`                                                                                                                                                                                 |
| A13 | A4 with `commons.source` only on `shared`                                                                                                                                                                                                                                                                      | The same four findings, all hypotheses; `check` exits 0                                                                                                                                                                                                   |
| A14 | Kubernetes: Deployment `api` with `DATABASE_URL` to Service `orders-db`, which selects StatefulSet `postgres`; no declared relationship                                                                                                                                                                        | 1 `relationship-undeclared` api → database (hypothesis, medium)                                                                                                                                                                                           |
| A15 | Single-package repository: root `package.json` `@acme/ledger`, `src/cli` imports `src/core`; no compose, Dockerfile, Kubernetes or workspaces; container with `commons.source "."` declaring component `core`                                                                                                  | 1 `component-undeclared` (`acme_ledger.cli`, hypothesis, low); the container maps by source; `derive` equals `expected/a15.dsl`                                                                                                                           |
| A16 | Context-level model (a person and a software system, no containers) and `api/openapi.yaml`                                                                                                                                                                                                                     | 1 `interface-unowned` (hypothesis, medium)                                                                                                                                                                                                                |

The exact expected findings are in `test/acceptance/expected/*.json`, written before the code.

## 11. Decisions made while specifying and building 0.1

| ID    | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-091 | The module graph comes only from `impact-check graph` (graph 1.0), read as a file; no resolver here (D-081).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D-092 | `commons.source` decides facts vs. guesses: findings resting on a name match are hypotheses; `container-undeclared` and `interface-unowned` are verified only when every declared container has `commons.source`.                                                                                                                                                                                                                                                                                                                                        |
| D-093 | Declared source directories with no deployment descriptor become as-built containers (`declared-source`), and workspace packages not in any container become `workspace-package` containers; neither is ever reported as undeclared.                                                                                                                                                                                                                                                                                                                     |
| D-094 | AsyncAPI channel matching is not in 0.1; AsyncAPI files count only as interfaces.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D-095 | Product Check `as-built-spec` input is not in 0.1: no alpha rule consumes endpoints, and integrations come from the same imports the graph gives.                                                                                                                                                                                                                                                                                                                                                                                                        |
| D-096 | `container-source-missing` from the design notes became `element-source-missing` (also covers components); `interface-owner-ambiguous` was dropped (longest-prefix ownership leaves only exact ties).                                                                                                                                                                                                                                                                                                                                                    |
| D-097 | `model-reference-invalid` (medium) is separate from `model-invalid` (high), so a dangling reference does not block by default while unsafe or unusable models do.                                                                                                                                                                                                                                                                                                                                                                                        |
| D-098 | Every report carries `static-analysis-only`; declared relationships with no static evidence are `unknown`, never verified absences.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D-099 | The GitHub Action installs the one runtime dependency from the lockfile (`npm ci --omit=dev --ignore-scripts`), as Impact Check does.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-100 | The repository root is a container in two cases: `commons.source "."` declares it, or a root `package.json` that is not a workspace root is the only code unit (no compose, Dockerfile, Kubernetes, declared source or workspace package container). A single-package repository therefore derives one container instead of an empty model. The root package is never `container-undeclared`. Origin `root-package` and evidence kind `package-manifest` are new enum values (report schema 1.1, D-102). Found by the first consumer run (Impact Check). |
| D-101 | `interface-unowned` is a hypothesis when no in-scope container is declared (a context-level model): D-092's "every declared container has `commons.source`" is then vacuously true, and ownership cannot be judged. The finding is kept, not skipped, so the API description still shows up. `container-undeclared` keeps D-092 as it is: with no declared containers, a deployable unit is missing from the model as a fact.                                                                                                                            |
| D-102 | Release 0.2.0 moves the report to schema `1.1`: D-100 adds enum values (`root-package`, `package-manifest`) that a strict validator of the 1.0 schema rejects. The shape is otherwise unchanged; readers that accept 1.0 can read 1.1 by allowing the new values.                                                                                                                                                                                                                                                                                        |
