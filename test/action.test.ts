// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * GitHub Action runner: inputs from INPUT_* variables, report files, step outputs, job summary, policy and error
 * handling (fail-open by default, fail-closed when blocking), path confinement.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAction } from "../src/action/run.js";
import { copyFixture } from "./helpers.js";

function env(workspace: string, inputs: Record<string, string>): Record<string, string> {
  const out = mkdtempSync(join(tmpdir(), "architecture-check-gh-"));
  const e: Record<string, string> = {
    GITHUB_WORKSPACE: workspace,
    GITHUB_OUTPUT: join(out, "output"),
    GITHUB_STEP_SUMMARY: join(out, "summary"),
  };
  writeFileSync(e["GITHUB_OUTPUT"] as string, "");
  writeFileSync(e["GITHUB_STEP_SUMMARY"] as string, "");
  for (const [k, v] of Object.entries(inputs)) e[`INPUT_${k}`] = v;
  return e;
}

function run(e: Record<string, string>): { code: number; log: string; outputs: string; summary: string } {
  let log = "";
  const code = runAction({ env: e, log: (t) => (log += `${t}\n`) });
  return {
    code,
    log,
    outputs: readFileSync(e["GITHUB_OUTPUT"] as string, "utf8"),
    summary: readFileSync(e["GITHUB_STEP_SUMMARY"] as string, "utf8"),
  };
}

describe("GitHub Action", () => {
  it("writes reports, outputs and the job summary; reports a policy failure without failing by default", () => {
    const ws = copyFixture("a4");
    const result = run(env(ws, { GRAPH: "graph.json", IMPACT_CHECK: "impact-check-report.json" }));
    expect(result.code).toBe(0);
    expect(result.outputs).toContain("findings=4\n");
    expect(result.outputs).toContain("high-findings=1\n");
    expect(result.outputs).toContain("policy=failed\n");
    expect(result.outputs).toContain("status=ok\n");
    expect(result.summary).toContain("# Architecture Check report");
    expect(result.log).toContain("::warning::Architecture Check policy failed");
    const json = JSON.parse(
      readFileSync(join(ws, "architecture-check-report", "architecture-check-report.json"), "utf8")
    ) as { command: string };
    expect(json.command).toBe("check");
    expect(
      readFileSync(join(ws, "architecture-check-report", "architecture-check-report.sarif"), "utf8")
    ).toContain("2.1.0");
  });

  it("fail-on-policy fails the step with exit 4", () => {
    const ws = copyFixture("a4");
    const result = run(env(ws, { GRAPH: "graph.json", FAIL_ON_POLICY: "true" }));
    expect(result.code).toBe(4);
    expect(result.log).toContain("::error::Architecture Check policy failed");
  });

  it("passes on a clean model; working-directory and model inputs", () => {
    const ws = mkdtempSync(join(tmpdir(), "architecture-check-ws-"));
    const dir = copyFixture("a1");
    const result = run(
      env("/", {
        WORKING_DIRECTORY: dir.slice(1),
        MODEL: "architecture/workspace.dsl",
        OUTPUT_DIR: ws.slice(1),
      })
    );
    expect(result.code).toBe(0);
    expect(result.outputs).toContain("policy=passed\n");
  });

  it("tool errors: fail-open by default, fail-closed when blocking or on-error=fail", () => {
    const ws = copyFixture("a1");
    expect(run(env(ws, { MODEL: "missing.dsl" })).code).toBe(0);
    expect(run(env(ws, { MODEL: "missing.dsl" })).outputs).toContain("status=error");
    expect(run(env(ws, { MODEL: "missing.dsl", FAIL_ON_POLICY: "true" })).code).toBe(3);
    expect(run(env(ws, { MODEL: "missing.dsl", ON_ERROR: "fail" })).code).toBe(3);
  });

  it("usage errors always fail: path escapes, absolute paths, bad flags", () => {
    const ws = copyFixture("a1");
    for (const inputs of [
      { WORKING_DIRECTORY: "../x" },
      { GRAPH: "/etc/passwd" },
      { OUTPUT_DIR: "a/../../b" },
      { ON_ERROR: "maybe" },
      { FAIL_ON_POLICY: "yes" },
    ])
      expect(run(env(ws, inputs)).code, JSON.stringify(inputs)).toBe(2);
  });

  it("uses the config file from config-path", () => {
    const ws = copyFixture("a2");
    writeFileSync(join(ws, "ac.json"), JSON.stringify({ ignore_containers: ["worker"] }));
    expect(run(env(ws, { CONFIG_PATH: "ac.json" })).outputs).toContain("findings=0\n");
  });
});
