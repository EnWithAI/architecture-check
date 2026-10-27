// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * CLI contract: commands, formats, exit codes, configuration, --output, --on-error and determinism.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cli, copyFixture, fixture, reportOf, tempRepo } from "./helpers.js";

describe("CLI", () => {
  it("--help, --version, no command", async () => {
    const help = await cli(["--help"], fixture("a1"));
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("architecture-check derive");
    expect(help.stdout).toContain("Exit codes: 0 ok");
    const version = await cli(["--version"], fixture("a1"));
    expect(version.stdout.trim()).toBe(
      (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string })
        .version
    );
    const none = await cli([], fixture("a1"));
    expect(none.code).toBe(2);
  });

  it("rules lists all twelve rules; schema prints the report schema", async () => {
    const rules = await cli(["rules"], fixture("a1"));
    expect(rules.stdout.trim().split("\n")).toHaveLength(13);
    expect(rules.stdout).toContain("boundary-violation");
    const schema = await cli(["schema"], fixture("a1"));
    expect((JSON.parse(schema.stdout) as { title: string }).title).toBe("Architecture Check report");
  });

  it("usage errors exit 2", async () => {
    const dir = fixture("a1");
    for (const args of [
      ["nope"],
      ["analyze", "--format", "dsl"],
      ["derive", "--format", "markdown"],
      ["derive", "--model", "x.dsl"],
      ["analyze", "--bogus"],
      ["analyze", "extra"],
      ["analyze", "--on-error", "maybe"],
      ["analyze", "--cwd", "does-not-exist"],
      ["analyze", "--output", join(dir, "missing-dir", "r.md")],
      ["analyze", "--output", dir],
    ])
      expect((await cli(args, dir)).code, args.join(" ")).toBe(2);
  });

  it("input errors exit 3, or 0 with --on-error pass", async () => {
    const empty = tempRepo({ "README.md": "x\n" });
    const missing = await cli(["analyze"], empty);
    expect(missing.code).toBe(3);
    expect(missing.stderr).toContain("architecture-check derive");
    expect((await cli(["analyze", "--on-error", "pass"], empty)).code).toBe(0);
    const dir = fixture("a1");
    expect((await cli(["analyze", "--graph", "nope.json"], dir)).code).toBe(3);
    expect((await cli(["analyze", "--model", "nope.dsl"], dir)).code).toBe(3);
    const wrong = tempRepo({
      "architecture/workspace.dsl": "workspace {\n  model {\n  }\n}\n",
      "g.json": '{"schema_version":"2.0","modules":[],"edges":[]}',
      "i.json": '{"schema_version":"1.0"}',
      "bad.json": "{",
      "m.txt": "x",
    });
    for (const args of [
      ["--graph", "g.json"],
      ["--graph", "bad.json"],
      ["--impact-check", "i.json"],
      ["--model", "m.txt"],
    ])
      expect((await cli(["analyze", ...args], wrong)).code, args.join(" ")).toBe(3);
  });

  it("output is deterministic apart from run_metadata", async () => {
    const dir = fixture("a4");
    const args = ["--graph", `${dir}/graph.json`];
    const a = await reportOf(dir, args);
    const b = await reportOf(copyFixture("a4"), ["--graph", "graph.json"]);
    expect({ ...a, run_metadata: null, inputs: null }).toEqual({ ...b, run_metadata: null, inputs: null });
    expect(a.inputs.graph?.path).toBe(b.inputs.graph?.path);
  });

  it("--output writes the file; markdown, sarif and calm formats render", async () => {
    const dir = copyFixture("a2");
    const result = await cli(["analyze", "--output", "r.sarif", "--format", "sarif"], dir);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("1 finding(s)");
    const sarif = JSON.parse(readFileSync(join(dir, "r.sarif"), "utf8")) as { version: string };
    expect(sarif.version).toBe("2.1.0");
    const md = await cli(["analyze", "--quiet", "--no-branding"], dir);
    expect(md.stdout).toContain("# Architecture Check report");
    expect(md.stdout).not.toContain("crewpe.ai");
  });

  it("config: system_name, ignore_containers, ignore, external_sdks and policy", async () => {
    const dir = copyFixture("a2");
    const configPath = join(dir, ".architecture-check.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      configPath,
      JSON.stringify({
        system_name: "Shop",
        ignore_containers: ["worker"],
        policy: { fail_on_severity: "medium" },
      })
    );
    const report = await reportOf(dir, [], "check");
    expect(report.as_built.system_name).toBe("Shop");
    expect(report.findings).toEqual([]);
    expect(report.ignored_containers).toEqual(["worker"]);
    writeFileSync(configPath, JSON.stringify({ ignore: ["worker/**", "docker-compose.yml"] }));
    const ignored = await reportOf(dir);
    expect(ignored.as_built.elements.map((e) => e.name)).toEqual(["api", "web"]);
    writeFileSync(
      configPath,
      JSON.stringify({ policy: { fail_on_severity: "medium", fail_on_statuses: ["verified_static_fact"] } })
    );
    expect((await cli(["check", "--quiet"], dir)).code).toBe(4);
    for (const bad of [
      { nope: 1 },
      { policy: { fail_on_severity: "critical" } },
      { policy: { fail_on_statuses: [] } },
      { policy: { other: 1 } },
      { ignore: "x" },
      { external_sdks: { a: 1 } },
      { system_name: "" },
      [],
    ]) {
      writeFileSync(configPath, JSON.stringify(bad));
      expect((await cli(["analyze", "--quiet"], dir)).code, JSON.stringify(bad)).toBe(2);
    }
    writeFileSync(configPath, "{");
    expect((await cli(["analyze", "--quiet"], dir)).code).toBe(2);
    expect((await cli(["analyze", "--quiet", "--config", "missing.json"], dir)).code).toBe(2);
  });

  it("config model and graph paths are used", async () => {
    const dir = copyFixture("a4");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      join(dir, ".architecture-check.json"),
      JSON.stringify({
        model: "architecture/calm.json",
        graph: "graph.json",
        external_sdks: { react: "React" },
      })
    );
    const report = await reportOf(dir);
    expect(report.declared_model?.format).toBe("calm");
    expect(report.inputs.graph?.path).toBe("graph.json");
    expect(report.findings.map((f) => f.subject)).toContain("React");
  });
});
