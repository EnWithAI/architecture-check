# Architecture

```
cli/run.ts ── analyze.ts ─┬─ input/walk.ts         repository walk (no symlinks, caps, classification)
action/run.ts ┘           ├─ input/inputs.ts       impact-check graph 1.0, Impact Check report 2.0
                          ├─ model/load.ts         locate + read the declared model
                          │    ├─ model/dsl.ts      Structurizr DSL subset → declared IR
                          │    └─ model/calm.ts     CALM JSON → declared IR
                          ├─ derive/asbuilt.ts     as-built model
                          │    ├─ parse/descriptors.ts  compose, Kubernetes, API descriptions (parse/yaml.ts)
                          │    ├─ parse/dockerfile.ts   FROM stages
                          │    ├─ derive/technology.ts  image → family
                          │    └─ derive/vendors.ts     package → vendor
                          ├─ drift/compare.ts      mapping, lifting, all rules (drift/rules.ts = catalog)
                          ├─ policy.ts
                          └─ report/               json, markdown, sarif, model-writers (DSL, CALM), escape, redact
```

Data flow: walk → (graph, impact report, model) → as-built model (declared source paths become containers when no
deployment descriptor names them) → compare → findings sorted, evidence capped at 5, everything redacted → render.

Design choices:

- **One resolver** (D-081): imports come from `impact-check graph`, read as a file; Architecture Check never resolves
  modules itself.
- **One IR for both model formats**, so A11 (the same model as DSL and CALM) gives identical findings.
- **Facts vs. guesses are decided by mapping**: `commons.source` makes a match a fact; a name match makes every
  finding that rests on it a hypothesis.
- **Unknown is a first-class result**: declared relationships without evidence are reported as `unknown`, and every
  report carries `static-analysis-only`.
- Helpers (`escape.ts`, `redact.ts`) are copied from the sibling tools, as decided in D-078.
