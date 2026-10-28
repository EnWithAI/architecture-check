// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Acceptance scenarios A1–A14 (docs/SPEC.md §10). Expected findings, DSL and CALM outputs were written by hand
 * before the implementation (test/acceptance/expected/).
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { brief, cli, copyFixture, expected, fixture, reportOf } from "../helpers.js";

const load = (name: string): unknown => JSON.parse(readFileSync(expected(name), "utf8"));
const graph = (dir: string): string[] => ["--graph", `${dir}/graph.json`];

describe("acceptance scenarios", () => {
  for (const id of ["a1", "a2", "a3", "a5", "a6", "a7", "a8", "a14"])
    it(`${id.toUpperCase()}: findings and limitations match the hand-computed expectation`, async () => {
      const report = await reportOf(fixture(id));
      expect(brief(report)).toEqual(load(`${id}.json`));
    });

  it("A1: derive --format dsl equals the expected workspace", async () => {
    const result = await cli(["derive", "--quiet"], fixture("a1"));
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(readFileSync(expected("a1.dsl"), "utf8"));
  });

  it("A4: four findings; check fails on the verified boundary violation", async () => {
    const dir = fixture("a4");
    const report = await reportOf(dir, graph(dir), "check");
    expect(brief(report)).toEqual(load("a4.json"));
    expect(report.policy.result).toBe("fail");
    expect(report.policy.violations).toHaveLength(1);
    const result = await cli(["check", "--quiet", ...graph(dir)], dir);
    expect(result.code).toBe(4);
  });

  it("A4: type-only and test imports are ignored", async () => {
    const dir = fixture("a4");
    const report = await reportOf(dir, graph(dir));
    const evidence = report.as_built.relationships.flatMap((r) =>
      r.evidence.map((e) => `${e.path}:${e.line_start}`)
    );
    expect(evidence).not.toContain("web/src/app.ts:3");
    expect(evidence.some((e) => e.startsWith("web/src/app.test.ts"))).toBe(false);
  });

  it("A10: derive DSL and CALM equal the expected files", async () => {
    const dir = fixture("a4");
    const dsl = await cli(["derive", "--quiet", ...graph(dir)], dir);
    expect(dsl.stdout).toBe(readFileSync(expected("a10.dsl"), "utf8"));
    const calm = await cli(["derive", "--format", "calm", "--quiet", ...graph(dir)], dir);
    expect(calm.stdout).toBe(readFileSync(expected("a10.calm.json"), "utf8"));
  });

  it("A10: the CALM output validates against the CALM 1.3 schemas (vendored copy)", async () => {
    const dir = fixture("a4");
    const calm = await cli(["derive", "--format", "calm", "--quiet", ...graph(dir)], dir);
    const vendor = fileURLToPath(new URL("../vendor/calm-1.3/", import.meta.url));
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    for (const file of readdirSync(vendor).filter((f) => f.endsWith(".json")))
      ajv.addSchema(JSON.parse(readFileSync(`${vendor}${file}`, "utf8")) as object);
    const validate = ajv.getSchema("https://calm.finos.org/release/1.3/meta/calm.json");
    expect(validate).toBeDefined();
    const ok = validate!(JSON.parse(calm.stdout));
    expect(validate!.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
    // The vendored schema rejects a broken document, so the check above is meaningful.
    expect(validate!({ nodes: [{ "unique-id": "x" }] })).toBe(false);
  });

  it("A11: the same model in CALM gives identical findings (snippets in CALM)", async () => {
    const dir = fixture("a4");
    const dsl = await reportOf(dir, graph(dir));
    const calm = await reportOf(dir, [...graph(dir), "--model", `${dir}/architecture/calm.json`]);
    expect(calm.declared_model?.format).toBe("calm");
    // Identical apart from the suggested snippet, which is written in the model's own format.
    const strip = (r: typeof dsl) => r.findings.map((f) => ({ ...f, suggested_model_change: null }));
    expect(strip(calm)).toEqual(strip(dsl));
    expect(calm.findings.find((f) => f.rule_id === "component-undeclared")?.suggested_model_change).toContain(
      '"unique-id": "payments"'
    );
    expect(calm.complete_mapping).toBe(true);
  });

  it("A12: an Impact Check report marks findings introduced or pre-existing", async () => {
    const dir = fixture("a4");
    const report = await reportOf(dir, [...graph(dir), "--impact-check", `${dir}/impact-check-report.json`]);
    expect(report.inputs.impact_check?.schema_version).toBe("2.0");
    expect(report.findings.map((f) => [f.rule_id, f.change_status])).toEqual([
      ["boundary-violation", "introduced"],
      ["relationship-undeclared", "pre-existing"],
      ["component-undeclared", "pre-existing"],
      ["external-system-undeclared", "pre-existing"],
    ]);
  });

  it("A13: names-only mapping gives the same findings as hypotheses, and check passes", async () => {
    const dir = fixture("a4");
    const args = [...graph(dir), "--model", `${dir}/architecture/names-only.dsl`];
    const report = await reportOf(dir, args, "check");
    expect(brief(report)).toEqual(load("a13.json"));
    expect(report.complete_mapping).toBe(false);
    expect(report.mapping.find((m) => m.declared_id === "shop.db")?.match).toBe("name");
    expect((await cli(["check", "--quiet", ...args], dir)).code).toBe(0);
  });

  it("A15: a single-package repository is one container; commons.source . maps to it", async () => {
    const dir = fixture("a15");
    const report = await reportOf(dir, graph(dir));
    expect(brief(report)).toEqual(load("a15.json"));
    expect(report.complete_mapping).toBe(true);
    expect(report.mapping.find((m) => m.declared_id === "ledger.app")).toMatchObject({
      as_built_ids: ["acme_ledger"],
      match: "source",
    });
    const container = report.as_built.elements.find((e) => e.id === "acme_ledger");
    expect(container?.origins).toEqual(["declared-source", "root-package"]);
    expect(container?.evidence.map((e) => [e.kind, e.path, e.line_start])).toEqual([
      ["package-manifest", "package.json", 2],
    ]);
  });

  it("A15: derive writes the root package as a container, with or without the graph", async () => {
    const dir = fixture("a15");
    const dsl = await cli(["derive", "--quiet", ...graph(dir)], dir);
    expect(dsl.code).toBe(0);
    expect(dsl.stdout).toBe(readFileSync(expected("a15.dsl"), "utf8"));
    const plain = await reportOf(dir, [], "derive");
    expect(plain.as_built.elements.map((e) => [e.id, e.origins, e.source_paths])).toEqual([
      ["acme_ledger", ["root-package"], ["."]],
    ]);
  });

  it("A16: interface-unowned is a hypothesis when the model declares no containers", async () => {
    const report = await reportOf(fixture("a16"));
    expect(brief(report)).toEqual(load("a16.json"));
  });

  it("A9: unsafe constructs are reported and never evaluated; names and secrets are safe", async () => {
    const dir = copyFixture("a9");
    const report = await reportOf(dir);
    expect(report.findings.map((f) => [f.rule_id, f.subject])).toEqual([
      ["model-invalid", "!include"],
      ["model-invalid", "!script"],
      ["container-undeclared", 'evil"name\n<img src=x onerror=alert(1)> @team'],
    ]);
  });
});
