// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Interoperability with Impact Check (D-081): the hand-written graph of fixture A4 equals what the published
 * `impact-check graph` (devDependency, pinned) produces for the same repository, and Architecture Check gives the
 * same findings from the real graph.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { brief, copyFixture, expected, reportOf } from "./helpers.js";

const impactCheck = fileURLToPath(
  new URL("../node_modules/@enwithai/impact-check/dist/cli/main.js", import.meta.url)
);

function git(dir: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args], {
    cwd: dir,
    stdio: "ignore",
  });
}

describe("Impact Check interoperability", () => {
  it("impact-check graph on A4 equals the hand-written graph; findings are the same", async () => {
    const dir = copyFixture("a4");
    const handWritten = JSON.parse(readFileSync(join(dir, "graph.json"), "utf8")) as Record<string, unknown>;
    rmSync(join(dir, "graph.json"));
    git(dir, "init", "-q");
    git(dir, "add", "-A");
    git(dir, "commit", "-qm", "fixture");
    const output = execFileSync(process.execPath, [impactCheck, "graph", "--cwd", dir, "--quiet"], {
      encoding: "utf8",
    });
    const real = JSON.parse(output) as Record<string, unknown>;
    for (const key of [
      "schema_version",
      "modules",
      "edges",
      "unresolved_imports",
      "external_imports",
      "stats",
      "coverage_limitations",
    ])
      expect(real[key], key).toEqual(handWritten[key]);
    expect((real["repository"] as { workspace_packages: unknown }).workspace_packages).toEqual(
      (handWritten["repository"] as { workspace_packages: unknown }).workspace_packages
    );
    writeFileSync(join(dir, "real-graph.json"), output);
    const report = await reportOf(dir, ["--graph", "real-graph.json"]);
    expect(brief(report)).toEqual(JSON.parse(readFileSync(expected("a4.json"), "utf8")));
  });
});
