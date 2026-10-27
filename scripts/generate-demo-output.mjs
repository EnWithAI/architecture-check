// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Regenerates the committed sample outputs in examples/demo/output/ with the built CLI. Run-specific metadata
 * (generated_at, duration_ms, node_version) is normalized so the samples are byte-reproducible.
 * Usage: npm run build && node scripts/generate-demo-output.mjs
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const demo = `${root}examples/demo`;
const bin = `${root}dist/cli/main.js`;

/** Normalizes run-specific metadata in a JSON report. */
export function normalizeJson(text) {
  const report = JSON.parse(text);
  report.run_metadata = {
    ...report.run_metadata,
    generated_at: "2026-01-01T00:00:00.000Z",
    duration_ms: 0,
    node_version: "normalized",
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Runs the CLI in the demo directory and returns stdout. */
function runCli(args) {
  const result = spawnSync(process.execPath, [bin, ...args], { cwd: demo, encoding: "utf8" });
  if (result.status !== 4 && result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const graph = ["--graph", "graph.json"];
  writeFileSync(`${demo}/output/architecture-check-report.md`, runCli(["check", "--quiet", ...graph]));
  writeFileSync(
    `${demo}/output/architecture-check-report.json`,
    normalizeJson(runCli(["check", "--quiet", "--format", "json", ...graph]))
  );
  writeFileSync(
    `${demo}/output/architecture-check-report.sarif`,
    runCli(["check", "--quiet", "--format", "sarif", ...graph])
  );
  writeFileSync(`${demo}/output/as-built.dsl`, runCli(["derive", "--quiet", ...graph]));
  writeFileSync(
    `${demo}/output/as-built.calm.json`,
    runCli(["derive", "--quiet", "--format", "calm", ...graph])
  );
  console.log("Wrote examples/demo/output/*");
}
