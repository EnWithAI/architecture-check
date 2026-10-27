// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Test helpers: run the CLI in-process, copy fixtures into temporary directories, build temporary repositories
 * and load reports.
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli/run.js";
import type { Report } from "../src/types.js";

/** Absolute path of a fixture directory. */
export const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

/** Absolute path of an expected-output file. */
export const expected = (name: string): string =>
  fileURLToPath(new URL(`./acceptance/expected/${name}`, import.meta.url));

/** Result of an in-process CLI run. */
export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI in-process with a fixed clock. */
export async function cli(args: string[], cwd: string): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
    cwd,
    now: () => new Date("2026-10-27T00:00:00.000Z"),
  });
  return { code, stdout, stderr };
}

/**
 * A fake token in GitHub's format, assembled at run time so that no token-shaped string is committed (keeps secret
 * scanning and push protection quiet). Fixtures reference it as __FAKE_GITHUB_TOKEN__.
 */
export const FAKE_GITHUB_TOKEN = ["ghp", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"].join("_");

function injectFakeToken(dir: string): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) injectFakeToken(path);
    else {
      const text = readFileSync(path, "utf8");
      if (text.includes("__FAKE_GITHUB_TOKEN__"))
        writeFileSync(path, text.replaceAll("__FAKE_GITHUB_TOKEN__", FAKE_GITHUB_TOKEN));
    }
  }
}

/** Copies a fixture into a fresh temporary directory and returns its path. */
export function copyFixture(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "architecture-check-"));
  cpSync(fixture(name), dir, { recursive: true, verbatimSymlinks: true });
  injectFakeToken(dir);
  return dir;
}

/** Creates a temporary directory containing the given files. */
export function tempRepo(files: Record<string, string | Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), "architecture-check-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

/** Runs a command with `--format json` and parses the report; fails on unexpected exit codes. */
export async function reportOf(
  cwd: string,
  args: string[] = [],
  command: "analyze" | "check" | "derive" = "analyze"
): Promise<Report> {
  const result = await cli([command, "--format", "json", "--quiet", ...args], cwd);
  if (result.code !== 0 && result.code !== 4)
    throw new Error(`${command} exited ${result.code}: ${result.stderr}`);
  return JSON.parse(result.stdout) as Report;
}

/** The comparable part of a finding (as in test/acceptance/expected/*.json). */
export function brief(report: Report): {
  findings: {
    rule_id: string;
    status: string;
    severity: string;
    subject: string;
    evidence: [string, number | null][];
  }[];
  limitations: string[];
} {
  return {
    findings: report.findings.map((f) => ({
      rule_id: f.rule_id,
      status: f.status,
      severity: f.severity,
      subject: f.subject,
      evidence: f.evidence.map((e) => [e.path, e.line_start] as [string, number | null]),
    })),
    limitations: report.coverage_limitations.map((l) => l.code),
  };
}

/** A minimal DSL workspace declaring the given container lines inside one system. */
export function dslWorkspace(body: string): string {
  return `workspace "T" {\n    !identifiers hierarchical\n    model {\n${body}\n    }\n}\n`;
}
