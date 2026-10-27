// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * README quickstart with the built CLI as a separate process: the demo must reproduce the committed sample outputs
 * byte-for-byte (apart from normalized run metadata). Skipped when dist/ has not been built.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs helper without type declarations
import { normalizeJson } from "../scripts/generate-demo-output.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const bin = join(root, "dist/cli/main.js");
const sample = (name: string): string => readFileSync(join(root, "examples/demo/output", name), "utf8");

describe.runIf(existsSync(bin))("README quickstart with the built CLI", () => {
  it("reproduces the committed demo outputs and exits 4 on the demo's policy failure", () => {
    const demo = mkdtempSync(join(tmpdir(), "architecture-check-demo-"));
    cpSync(join(root, "examples/demo"), demo, { recursive: true });
    rmSync(join(demo, "output"), { recursive: true });
    const env = { PATH: process.env["PATH"] ?? "" };
    const runCli = (args: string[]) =>
      spawnSync(process.execPath, [bin, ...args], { cwd: demo, encoding: "utf8", env });
    const graph = ["--graph", "graph.json"];
    const md = runCli(["check", ...graph]);
    expect(md.status).toBe(4);
    expect(md.stdout).toBe(sample("architecture-check-report.md"));
    expect(md.stderr).toContain("policy fail");
    expect(
      (normalizeJson as (t: string) => string)(
        runCli(["check", "--quiet", "--format", "json", ...graph]).stdout
      )
    ).toBe(sample("architecture-check-report.json"));
    expect(runCli(["check", "--quiet", "--format", "sarif", ...graph]).stdout).toBe(
      sample("architecture-check-report.sarif")
    );
    expect(runCli(["derive", "--quiet", ...graph]).stdout).toBe(sample("as-built.dsl"));
    expect(runCli(["derive", "--quiet", "--format", "calm", ...graph]).stdout).toBe(
      sample("as-built.calm.json")
    );
    expect(runCli(["--help"]).status).toBe(0);
  });
});
