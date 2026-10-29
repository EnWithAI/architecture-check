// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Unit tests for parsers, tables and edge cases not covered by the acceptance fixtures.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { familiesOfText, familyOfImage, isDatastore } from "../src/derive/technology.js";
import { packageOf, vendorOf } from "../src/derive/vendors.js";
import { isGitignored, parseGitignore } from "../src/input/gitignore.js";
import { Limitations } from "../src/limitations.js";
import { readCalm } from "../src/model/calm.js";
import { readDsl } from "../src/model/dsl.js";
import { readDockerfile } from "../src/parse/dockerfile.js";
import { hostOf, readCompose, readYamlContent } from "../src/parse/descriptors.js";
import { normalizeRelative, slug } from "../src/util/paths.js";
import { dslWorkspace, reportOf, tempRepo } from "./helpers.js";

describe("technology", () => {
  it("maps images to families", () => {
    expect(familyOfImage("node:22-alpine")).toBe("Node.js");
    expect(familyOfImage("gcr.io/distroless/nodejs22-debian12")).toBe("Node.js");
    expect(familyOfImage("docker.io/library/python:3.12-slim@sha256:abcdef")).toBe("Python");
    expect(familyOfImage("mcr.microsoft.com/dotnet/aspnet:8.0")).toBe(".NET");
    expect(familyOfImage("eclipse-temurin:21-jre")).toBe("Java");
    expect(familyOfImage("confluentinc/cp-kafka:7.6.0")).toBe("Kafka");
    expect(familyOfImage("localhost:5000/postgres:16")).toBe("PostgreSQL");
    expect(familyOfImage("ghcr.io/example/api:1.4.2")).toBeNull();
    expect(familyOfImage("${BASE_IMAGE}")).toBeNull();
    expect(familyOfImage("alpine:3.20")).toBeNull();
    expect(isDatastore("Redis")).toBe(true);
    expect(isDatastore("Node.js")).toBe(false);
  });

  it("reads families from declared technology text by token", () => {
    expect(familiesOfText("Node.js, TypeScript")).toEqual(["Node.js"]);
    expect(familiesOfText("ASP.NET Core")).toEqual([".NET"]);
    expect(familiesOfText("Django")).toEqual(["Python"]);
    expect(familiesOfText("Spring-Boot")).toEqual(["Java"]);
    expect(familiesOfText("MongoDB")).toEqual(["MongoDB"]);
    expect(familiesOfText("Some in-house thing")).toEqual([]);
  });
});

describe("vendors and hosts", () => {
  it("package names and vendor lookup", () => {
    expect(packageOf("@aws-sdk/client-s3/dist/x")).toBe("@aws-sdk/client-s3");
    expect(packageOf("stripe/lib/x")).toBe("stripe");
    expect(packageOf("./local")).toBeNull();
    expect(packageOf("node:fs")).toBeNull();
    expect(packageOf("@scope")).toBeNull();
    expect(vendorOf("@aws-sdk/client-s3", {})).toBe("AWS");
    expect(vendorOf("internal-billing", { "internal-billing": "Billing platform" })).toBe("Billing platform");
    expect(vendorOf("@corp/pay-client", { "@corp/*": "Corp" })).toBe("Corp");
    expect(vendorOf("lodash", {})).toBeNull();
  });

  it("host names in configuration values", () => {
    expect(hostOf("postgres://user:pw@db:5432/app")).toBe("db");
    expect(hostOf("http://API.internal/x")).toBe("api.internal");
    expect(hostOf("redis:6379")).toBe("redis");
    expect(hostOf("just text")).toBeNull();
    expect(hostOf("123")).toBeNull();
  });
});

describe("descriptor parsers", () => {
  it("Dockerfile: multi-stage, continuations, platform flags", () => {
    expect(
      readDockerfile("FROM --platform=$BUILDPLATFORM node:22 AS build\nRUN x\nFROM nginx:1.27\n")
    ).toEqual({
      image: "nginx:1.27",
      line: 3,
    });
    expect(readDockerfile("FROM node:22 AS base\nFROM base AS build\nFROM \\\n  build\n")).toEqual({
      image: "node:22",
      line: 3,
    });
    expect(readDockerfile("FROM node AS node\n")).toEqual({ image: "node", line: 1 });
    expect(readDockerfile("# nothing\n")).toEqual({ image: null, line: 1 });
  });

  it("compose: list environment, map depends_on, links, build object", () => {
    const services = readCompose(
      "c.yml",
      "services:\n  a:\n    build:\n      context: ./svc\n      dockerfile: Dockerfile.prod\n    depends_on:\n      b:\n        condition: service_healthy\n    links:\n      - c:alias\n    environment:\n      - URL=http://b:80\n      - FLAG\n      - =x\n  b:\n    image: redis:7\n"
    );
    expect(services).not.toBeNull();
    const a = services![0]!;
    expect(a.buildContext).toBe("./svc");
    expect(a.dockerfile).toBe("Dockerfile.prod");
    expect(a.dependsOn).toEqual([
      { name: "b", line: 7, label: "depends_on" },
      { name: "c", line: 10, label: "links" },
    ]);
    expect(a.hosts).toEqual([{ variable: "URL", host: "b", line: 12 }]);
    expect(readCompose("c.yml", "x: [")).toBeNull();
    expect(readCompose("c.yml", "- 1\n")).toEqual([]);
    expect(readCompose("c.yml", "services: 1\n")).toEqual([]);
  });

  it("Kubernetes: CronJob template, Services without selector, non-workload kinds", () => {
    const content = readYamlContent(
      "k.yaml",
      [
        "apiVersion: batch/v1",
        "kind: CronJob",
        "metadata:",
        "  name: nightly",
        "spec:",
        "  jobTemplate:",
        "    spec:",
        "      template:",
        "        spec:",
        "          containers:",
        "            - name: job",
        "              image: python:3.12",
        "              env:",
        "                - name: TARGET",
        "                  value: http://api:8080",
        "---",
        "apiVersion: v1",
        "kind: Service",
        "metadata:",
        "  name: headless",
        "spec: {}",
        "---",
        "apiVersion: v1",
        "kind: ConfigMap",
        "metadata:",
        "  name: cfg",
        "---",
        "asyncapi: 3.0.0",
        "",
      ].join("\n")
    );
    expect(content?.workloads).toEqual([
      {
        file: "k.yaml",
        name: "nightly",
        line: 4,
        labels: {},
        image: "python:3.12",
        imageLine: 12,
        hosts: [{ variable: "TARGET", host: "api", line: 14 }],
      },
    ]);
    expect(content?.services).toEqual([]);
    expect(content?.apis).toEqual([{ file: "k.yaml", format: "asyncapi", version: "3.0.0", line: 28 }]);
  });
});

describe("DSL subset", () => {
  const read = (text: string) => {
    const limitations = new Limitations();
    return { model: readDsl(text, "m.dsl", limitations), limitations: limitations.list().map((l) => l.code) };
  };

  it("groups, implicit sources, this, flat identifiers, external tags", () => {
    const { model } = read(
      'workspace {\n  model {\n    u = person "User"\n    group "G" {\n      s = softwareSystem "S" {\n        a = container "A" {\n          technology "Go"\n          -> b "calls"\n        }\n        b = container "B"\n      }\n    }\n    x = softwareSystem "X" "" "External"\n    a -> x\n    u -> s\n  }\n}\n'
    );
    expect(model.usable).toBe(true);
    expect(model.elements.map((e) => [e.id, e.kind, e.parent, e.technology])).toEqual([
      ["u", "person", null, null],
      ["s", "software_system", null, null],
      ["a", "container", "s", "Go"],
      ["b", "container", "s", null],
      ["x", "external_system", null, null],
    ]);
    expect(model.relationships.map((r) => `${r.from}->${r.to}`)).toEqual(["a->b", "a->x", "u->s"]);
  });

  it("reports dangling references, duplicates and undefined allowed dependencies", () => {
    const { model } = read(
      dslWorkspace(
        '        s = softwareSystem "S" {\n            a = container "A" {\n                properties {\n                    "commons.allowed-dependencies" "s.nope"\n                }\n            }\n            a = container "A2"\n        }\n        s.a -> s.missing\n        this -> s.a'
      )
    );
    expect(model.issues.map((i) => [i.rule, i.subject])).toEqual([
      ["model-reference-invalid", "s.a"],
      ["model-reference-invalid", "this"],
      ["model-reference-invalid", "s.nope"],
      ["model-reference-invalid", "s.missing"],
    ]);
  });

  it("unusable models: unbalanced braces, no model, extra closing brace", () => {
    expect(read("workspace {\n  model {\n").model.usable).toBe(false);
    expect(read("workspace {\n}\n").model.usable).toBe(false);
    expect(read("}\n").model.usable).toBe(false);
    expect(read('workspace "x').model.usable).toBe(false);
  });

  it("refuses workspace extends and !plugin; skips and reports the rest", () => {
    const { model, limitations } = read(
      'workspace extends https://example.com/w.dsl {\n  !plugin com.example.Plugin\n  !const X "y"\n  !include local.dsl\n  !docs docs\n  !adrs https://example.com/adrs\n  name "w"\n  properties {\n    "k" "v"\n  }\n  model {\n    !impliedRelationships false\n    deploymentEnvironment "Live" {\n      deploymentNode "n" {\n      }\n    }\n    e = element "Custom" {\n    }\n    s = softwareSystem "S"\n    s -> \n    foo bar\n  }\n  styles {\n  }\n  unknown {\n  }\n}\n'
    );
    expect(model.usable).toBe(true);
    expect(model.issues.map((i) => i.subject)).toEqual(["workspace extends", "!plugin"]);
    expect(model.pathReferences).toEqual([{ path: "docs", line: 5 }]);
    expect(limitations).toEqual([
      "dsl-deployment-ignored",
      "dsl-include-not-followed",
      "dsl-statement-ignored",
      "static-analysis-only",
    ]);
  });
});

describe("CALM reader", () => {
  const read = (doc: unknown) => {
    const limitations = new Limitations();
    const text = typeof doc === "string" ? doc : JSON.stringify(doc, null, 2);
    return {
      model: readCalm(text, "m.json", limitations),
      limitations: limitations.list().map((l) => l.code),
    };
  };

  it("invalid documents", () => {
    expect(read("{").model.issues[0]?.subject).toBe("json");
    expect(read({ relationships: [] }).model.usable).toBe(false);
  });

  it("reference problems, unsupported content and ADR references", () => {
    const { model, limitations } = read({
      nodes: [
        { "unique-id": "s", "node-type": "system", name: "S", description: "" },
        {
          "unique-id": "ext",
          "node-type": "system",
          name: "E",
          description: "",
          metadata: { "commons.external": true },
        },
        { "unique-id": "a", "node-type": "service", name: "A", description: "", controls: {} },
        { "unique-id": "a", "node-type": "service", name: "dup", description: "" },
        { "node-type": "service" },
        {
          "unique-id": "c",
          "node-type": "component",
          name: "C",
          description: "",
          metadata: { "commons.allowed-dependencies": ["zzz"] },
        },
      ],
      relationships: [
        {
          "unique-id": "r1",
          "relationship-type": { connects: { source: { node: "a" }, destination: { node: "q" } } },
        },
        {
          "unique-id": "r2",
          "relationship-type": { connects: { source: { node: "q" }, destination: { node: "a" } } },
        },
        { "unique-id": "r3", "relationship-type": { interacts: { actor: "nobody", nodes: ["a"] } } },
        { "unique-id": "r4", "relationship-type": { "composed-of": { container: "s", nodes: ["a", "q"] } } },
        { "unique-id": "r5", "relationship-type": { "composed-of": { container: "q", nodes: ["a"] } } },
        { "unique-id": "r6", "relationship-type": { options: [] } },
        { "unique-id": "r7" },
        { "unique-id": "r8", "relationship-type": { "deployed-in": { container: "a", nodes: ["c"] } } },
      ],
      flows: [],
      adrs: ["docs/adr/0001.md", "https://example.com/adr/2"],
    });
    expect(model.elements.map((e) => [e.id, e.kind, e.parent])).toEqual([
      ["s", "software_system", null],
      ["ext", "external_system", null],
      ["a", "container", "s"],
      ["c", "component", "a"],
    ]);
    expect(model.issues.map((i) => i.subject)).toEqual([
      "a",
      "node",
      "q",
      "q",
      "nobody",
      "q",
      "q",
      "r7",
      "zzz",
    ]);
    expect(model.pathReferences.map((r) => r.path)).toEqual(["docs/adr/0001.md"]);
    expect(limitations).toContain("calm-unsupported");
  });

  it("stale ADR references and allowed-dependency problems become findings", async () => {
    const dir = tempRepo({
      "architecture/calm.json": JSON.stringify(
        {
          nodes: [{ "unique-id": "s", "node-type": "system", name: "S", description: "" }],
          adrs: ["../docs/adr/0001.md", "../docs/adr/0002.md"],
        },
        null,
        2
      ),
      "docs/adr/0001.md": "# ADR\n",
    });
    const report = await reportOf(dir);
    expect(report.findings.map((f) => [f.rule_id, f.subject, f.evidence[0]?.line_start])).toEqual([
      ["model-stale-reference", "../docs/adr/0002.md", 12],
    ]);
  });
});

describe("repository walk and limitations", () => {
  it("IaC, kustomize, large and non-UTF-8 files, other languages, graph path mismatch", async () => {
    const dir = tempRepo({
      "architecture/workspace.dsl": dslWorkspace(
        '        s = softwareSystem "S" {\n            py = container "Py" "" "Python" {\n                properties {\n                    "commons.source" "py"\n                }\n            }\n        }'
      ),
      "py/Dockerfile": "FROM python:3.12\n",
      "py/app.py": "print(1)\n",
      "infra/main.tf": "x\n",
      "cdk.json": "{}\n",
      "k8s/kustomization.yaml": "resources: []\n",
      "k8s/deploy.yaml": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: py\n",
      "big.yaml": `x: "${"a".repeat(1024 * 1024)}"\n`,
      "bin.yaml": Buffer.from([0xff, 0xfe, 0x00, 0x41]),
      "graph.json": JSON.stringify({
        schema_version: "1.0",
        modules: [{ path: "gone.ts", kind: "source" }],
        edges: [{ from: "gone.ts", to: "x.ts", imports: [] }],
        external_imports: [],
      }),
    });
    const report = await reportOf(dir, ["--graph", "graph.json"]);
    const codes = Object.fromEntries(report.coverage_limitations.map((l) => [l.code, l.paths]));
    expect(codes["iac-not-evaluated"]).toEqual(["cdk.json", "infra/main.tf"]);
    expect(codes["kustomize-not-rendered"]).toEqual(["k8s"]);
    expect(codes["file-too-large"]).toEqual(["big.yaml"]);
    expect(codes["file-not-utf8"]).toEqual(["bin.yaml"]);
    expect(codes["component-graph-language-unsupported"]).toEqual(["py"]);
    expect(codes["graph-path-mismatch"]).toEqual(["gone.ts"]);
    expect(report.as_built.elements.map((e) => [e.name, e.origins, e.technology])).toEqual([
      ["py", ["dockerfile", "kubernetes"], "Python"],
    ]);
    expect(report.findings).toEqual([]);
  });

  it(".gitignore files and .git/info/exclude keep ignored paths out of the walk (D-103)", async () => {
    const compose = (service: string): string => `services:\n  ${service}:\n    image: nginx:1.27\n`;
    const dir = tempRepo({
      ".gitignore": "# nested product repositories\nvendored/\ncompose.*.yml\n!compose.keep.yml\n",
      ".git/info/exclude": "scratch\n",
      "compose.yml": compose("web"),
      "vendored/compose.yml": compose("vendored"),
      "compose.override.yml": compose("override"),
      "compose.keep.yml": compose("kept"),
      "scratch/compose.yml": compose("scratch"),
      "tools/.gitignore": "/fixtures/\n",
      "tools/fixtures/compose.yml": compose("fixture"),
      "tools/other/fixtures/compose.yml": compose("deep_fixture"),
    });
    const names = (r: Awaited<ReturnType<typeof reportOf>>): string[] =>
      r.as_built.elements.map((e) => e.name).sort();
    const report = await reportOf(dir, [], "derive");
    expect(names(report)).toEqual(["deep_fixture", "kept", "web"]);
    const skipped = report.coverage_limitations.find((l) => l.code === "gitignored-skipped");
    expect(skipped?.paths).toEqual(["compose.override.yml", "scratch", "tools/fixtures", "vendored"]);

    writeFileSync(join(dir, ".architecture-check.json"), JSON.stringify({ respect_gitignore: false }));
    const all = await reportOf(dir, [], "derive");
    expect(names(all)).toEqual(["deep_fixture", "fixture", "kept", "override", "scratch", "vendored", "web"]);
    expect(all.coverage_limitations.some((l) => l.code === "gitignored-skipped")).toBe(false);

    writeFileSync(join(dir, ".architecture-check.json"), JSON.stringify({ respect_gitignore: "yes" }));
    await expect(reportOf(dir, [], "derive")).rejects.toThrow(/exited 2/);
  });

  it("gitignore pattern semantics", () => {
    const rules = [
      ...parseGitignore(
        "*.log\n!important.log\nbuild/\n/root-only\ndocs/**/draft.md\na/**\n\\#hash\nfoo\\ \n[ab]?.txt\n",
        "."
      ),
      ...parseGitignore("local\n", "pkg"),
    ];
    const ignored = (p: string, dir = false): boolean => isGitignored(p, dir, rules);
    expect(ignored("x/debug.log")).toBe(true);
    expect(ignored("x/important.log")).toBe(false);
    expect(ignored("x/build", true)).toBe(true);
    expect(ignored("x/build")).toBe(false);
    expect(ignored("root-only")).toBe(true);
    expect(ignored("x/root-only")).toBe(false);
    expect(ignored("docs/draft.md")).toBe(true);
    expect(ignored("docs/a/b/draft.md")).toBe(true);
    expect(ignored("a/x/y")).toBe(true);
    expect(ignored("a", true)).toBe(false);
    expect(ignored("#hash")).toBe(true);
    expect(ignored("foo ")).toBe(true);
    expect(ignored("a1.txt")).toBe(true);
    expect(ignored("c1.txt")).toBe(false);
    expect(ignored("pkg/local")).toBe(true);
    expect(ignored("pkg/sub/local")).toBe(true);
    expect(ignored("local")).toBe(false);
    expect(parseGitignore("# only\n\n   \n/\n", ".")).toEqual([]);
  });

  it("malformed graph files are input errors", async () => {
    const dir = tempRepo({ "architecture/workspace.dsl": dslWorkspace('        s = softwareSystem "S"') });
    for (const graph of [
      [],
      { schema_version: "1.0", modules: [{}], edges: [] },
      { schema_version: "1.0", modules: [], edges: [{}] },
      { schema_version: "1.0", modules: [], edges: [], external_imports: [{}] },
    ]) {
      writeFileSync(join(dir, "g.json"), JSON.stringify(graph));
      await expect(reportOf(dir, ["--graph", "g.json"])).rejects.toThrow(/exited 3/);
    }
  });

  it("paths and slugs", () => {
    expect(normalizeRelative("./a/b/")).toBe("a/b");
    expect(normalizeRelative("a/../..")).toBeNull();
    expect(normalizeRelative("/etc")).toBeNull();
    expect(normalizeRelative("C:/x")).toBeNull();
    expect(normalizeRelative("")).toBeNull();
    expect(normalizeRelative("a/..")).toBe(".");
    expect(slug("@shop/shared")).toBe("shop_shared");
    expect(slug("123")).toBe("e_123");
    expect(slug("!!!")).toBe("element");
  });
});

describe("mapping edge cases", () => {
  it("ignored elements, ignored containers by alias, external mapping by name, extra declared sources", async () => {
    const dir = tempRepo({
      "architecture/workspace.dsl": dslWorkspace(
        [
          '        s = softwareSystem "S" {',
          '            api = container "API" "" "Node.js" {',
          "                properties {",
          '                    "commons.source" "api"',
          '                    "commons.allowed-dependencies" "s.lib, aws"',
          "                }",
          "            }",
          '            lib = container "Lib" {',
          "                properties {",
          '                    "commons.source" "libs/lib"',
          "                }",
          "            }",
          '            old = container "Old" {',
          "                properties {",
          '                    "commons.source" "old"',
          '                    "commons.ignore" "true"',
          "                }",
          "            }",
          "        }",
          '        aws = softwareSystem "Amazon Web Services (AWS)" "" "External"',
          "        s.api -> s.lib",
          "        s.api -> s.old",
          "        s.api -> aws",
        ].join("\n")
      ),
      "api/Dockerfile": "FROM node:22\n",
      "api/src/index.ts": "x\n",
      "libs/lib/index.ts": "x\n",
      "docker-compose.yml":
        "services:\n  api:\n    build: ./api\n  sidecar:\n    image: envoyproxy/envoy:v1.31\n",
      "graph.json": JSON.stringify({
        schema_version: "1.0",
        modules: [
          { path: "api/src/index.ts", kind: "source" },
          { path: "libs/lib/index.ts", kind: "source" },
        ],
        edges: [
          { from: "api/src/index.ts", to: "libs/lib/index.ts", provenance: "graph", imports: [{ line: 1 }] },
        ],
        external_imports: [{ from: "api/src/index.ts", specifier: "@aws-sdk/client-s3", line: 2 }],
      }),
      ".architecture-check.json": JSON.stringify({ ignore_containers: ["sidecar"] }),
    });
    const report = await reportOf(dir, ["--graph", "graph.json"]);
    expect(report.findings).toEqual([]);
    expect(report.ignored_containers).toEqual(["sidecar"]);
    expect(report.mapping.map((m) => [m.declared_id, m.as_built_ids, m.match, m.ignored])).toEqual([
      ["aws", ["aws"], "name", false],
      ["s", [], "not-applicable", false],
      ["s.api", ["api"], "source", false],
      ["s.lib", ["libs_lib"], "source", false],
      ["s.old", [], "none", true],
    ]);
  });

  it("the repository root (D-100): workspace roots, root sources without a manifest, name clashes", async () => {
    const containers = async (files: Record<string, string>, command: "analyze" | "derive" = "derive") =>
      (await reportOf(tempRepo(files), [], command)).as_built.elements.map((e) => [
        e.name,
        e.origins,
        e.source_paths,
        e.evidence.map((x) => x.detail),
      ]);
    // A workspace root is not a container of its own.
    expect(
      await containers({ "package.json": '{ "name": "mono", "workspaces": ["packages/*"] }\n' })
    ).toEqual([]);
    expect(
      await containers({ "package.json": '{ "name": "mono" }\n', "pnpm-workspace.yaml": "packages: []\n" })
    ).toEqual([]);
    // Another container exists: the root package is not added.
    expect(await containers({ "package.json": '{ "name": "x" }\n', Dockerfile: "FROM node:22\n" })).toEqual([
      ["app", ["dockerfile"], ["."], ["FROM node:22"]],
    ]);
    // Unparseable manifest: present, without a name.
    expect(await containers({ "package.json": "{ not json\n" })).toEqual([
      ["app", ["root-package"], ["."], ["package.json without a usable name"]],
    ]);
    // A declared `.` with no manifest, beside a compose service with the fallback name.
    const model = dslWorkspace(
      [
        '        s = softwareSystem "S" {',
        '            web = container "Web" {',
        "                properties {",
        '                    "commons.source" "."',
        "                }",
        "            }",
        '            app = container "App" {',
        "                properties {",
        '                    "commons.source" "app"',
        "                }",
        "            }",
        "        }",
      ].join("\n")
    );
    const dir = tempRepo({
      "architecture/workspace.dsl": model,
      "docker-compose.yml": "services:\n  app:\n    image: nginx:1.27\n",
    });
    const report = await reportOf(dir);
    expect(report.findings).toEqual([]);
    expect(report.as_built.elements.map((e) => [e.id, e.name, e.origins, e.source_paths])).toEqual([
      ["app", "app", ["compose"], []],
      ["app_repository_root", "app (repository root)", ["declared-source"], ["."]],
    ]);
  });
});
