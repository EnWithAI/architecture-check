// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Security invariants: no network, process or eval primitives in src/; nothing in the model is executed or
 * fetched; secrets never reach any output; symbolic links are not followed; the tool writes only --output.
 */
import { existsSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cli, copyFixture, FAKE_GITHUB_TOKEN, reportOf, tempRepo } from "./helpers.js";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "fixtures" || name === "vendor") return [];
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

function tree(dir: string, prefix = ""): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? tree(path, `${prefix}${name}/`) : [`${prefix}${name}`];
    })
    .sort();
}

describe("security invariants", () => {
  it("source code contains no network, process or eval primitives", () => {
    const src = fileURLToPath(new URL("../src", import.meta.url));
    for (const file of sourceFiles(src)) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(
        /from "node:(http|https|net|tls|dgram|http2|child_process|worker_threads|vm)"/
      );
      expect(text, file).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|\beval\(|new Function\(|\bimport\(/);
    }
  });

  it("source and tests contain no invisible or bidirectional control characters (Trojan Source)", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    for (const file of [...sourceFiles(join(root, "src")), ...sourceFiles(join(root, "test"))])
      expect(readFileSync(file, "utf8"), file).not.toMatch(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/);
  });

  it("A9: !script is never run and a remote !include is never fetched", async () => {
    const dir = copyFixture("a9");
    const marker = "/tmp/architecture-check-pwned";
    const before = existsSync(marker);
    const report = await reportOf(dir, [], "check");
    expect(existsSync(marker)).toBe(before);
    expect(report.policy.result).toBe("fail");
    expect(
      report.findings.filter((f) => f.rule_id === "model-invalid").map((f) => f.evidence[0]?.line_start)
    ).toEqual([3, 5]);
  });

  it("A9: tokens and URL credentials in environment values reach no output", async () => {
    const dir = copyFixture("a9");
    expect(readFileSync(join(dir, "docker-compose.yml"), "utf8")).toContain(FAKE_GITHUB_TOKEN);
    for (const args of [
      ["analyze", "--format", "json"],
      ["analyze", "--format", "markdown"],
      ["analyze", "--format", "sarif"],
      ["derive", "--format", "dsl"],
      ["derive", "--format", "calm"],
    ]) {
      const result = await cli([...args, "--quiet"], dir);
      expect(result.stdout).not.toContain(FAKE_GITHUB_TOKEN);
      expect(result.stdout).not.toContain("hunter2");
      expect(result.stdout).not.toContain("GITHUB_TOKEN");
    }
  });

  it("symbolic links are never followed and are reported", async () => {
    const dir = copyFixture("a9");
    symlinkSync("/etc", join(dir, "etc-link"));
    symlinkSync(join(dir, "app", "Dockerfile"), join(dir, "Dockerfile"));
    const report = await reportOf(dir);
    const symlinks = report.coverage_limitations.find((l) => l.code === "symlink-skipped");
    expect(symlinks?.paths).toEqual(["Dockerfile", "etc-link"]);
    expect(report.as_built.elements.map((e) => e.name)).not.toContain("app_2");
  });

  it("a model or reference outside the root is confined", async () => {
    const dir = tempRepo({
      "architecture/workspace.dsl":
        'workspace {\n  !adrs ../../../../etc\n  model {\n    s = softwareSystem "S" {\n      c = container "C" {\n        properties {\n          "commons.source" "../outside"\n        }\n      }\n    }\n  }\n}\n',
      "docker-compose.yml": "services:\n  c:\n    build: ../../outside\n",
    });
    const report = await reportOf(dir);
    expect(report.findings.map((f) => f.rule_id).sort()).toEqual([
      "container-undeclared",
      "element-source-missing",
      "model-stale-reference",
    ]);
    expect(report.coverage_limitations.map((l) => l.code)).toContain("path-outside-root");
    expect(report.as_built.elements.find((e) => e.name === "c")?.source_paths).toEqual([]);
  });

  it("writes nothing except --output", async () => {
    const dir = copyFixture("a4");
    const before = tree(dir);
    await cli(["check", "--quiet", "--graph", "graph.json"], dir);
    await cli(["derive", "--format", "calm", "--quiet"], dir);
    expect(tree(dir)).toEqual(before);
    await cli(["analyze", "--quiet", "--output", "r.md"], dir);
    expect(tree(dir)).toEqual([...before, "r.md"].sort());
  });

  it("YAML alias bombs are refused; unknown tags are never honored", async () => {
    const bomb = ["a: &a [x, x, x, x, x, x, x, x, x]"];
    for (let i = 0; i < 12; i++)
      bomb.push(
        `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [*${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}]`
      );
    const dir = tempRepo({
      "architecture/workspace.dsl": 'workspace {\n  model {\n    s = softwareSystem "S"\n  }\n}\n',
      "bomb.yaml": `${bomb.join("\n")}\n`,
      "tag.yaml": "x: !!js/function 'function () { return 1 }'\n",
    });
    writeFileSync(join(dir, "ok.yaml"), "openapi: 3.0.3\n");
    const report = await reportOf(dir);
    expect(report.coverage_limitations.find((l) => l.code === "yaml-unparseable")?.paths).toEqual([
      "bomb.yaml",
    ]);
    expect(report.as_built.interfaces.map((i) => i.path)).toEqual(["ok.yaml"]);
  });
});
