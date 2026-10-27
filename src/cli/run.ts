// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Command-line interface: argument parsing (node:util parseArgs), commands (derive, analyze, check, rules,
 * schema), configuration loading, output writing and the mapping of every error to a documented exit code.
 */
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { analyze } from "../analyze.js";
import { DEFAULT_CONFIG, loadConfigFile, type Config } from "../config.js";
import { RULES } from "../drift/rules.js";
import { ArchitectureCheckError, ExitCode, usageError } from "../errors.js";
import { renderJson } from "../report/json.js";
import { renderMarkdown } from "../report/markdown.js";
import { renderCalm, renderDsl } from "../report/model-writers.js";
import { renderSarif } from "../report/sarif.js";
import { TOOL_VERSION } from "../version.js";

/** I/O seams for the CLI so it can run in-process in tests. */
export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  now?: () => Date;
}

/** Text printed by `architecture-check --help`. */
export const HELP = `Architecture Check ${TOOL_VERSION} — does the architecture model in git still describe the code beside it?

Usage:
  architecture-check derive  [options]   Write the as-built model (--format dsl, calm or json; default dsl)
  architecture-check analyze [options]   Compare the declared model with the as-built model (exit 0 unless an error occurs)
  architecture-check check   [options]   Compare, then apply the policy (exit 4 on policy failure)
  architecture-check rules               List the rules
  architecture-check schema              Print the JSON Schema of the report
  architecture-check --help | --version

Options:
  --model <file>           Declared model: Structurizr DSL (.dsl) or CALM (.json). Default: architecture/workspace.dsl,
                           architecture/calm.json, architecture/architecture.json, workspace.dsl,
                           docs/architecture/workspace.dsl, docs/architecture/calm.json (first that exists)
  --graph <file>           Module graph from \`impact-check graph --format json\` (components and imports)
  --impact-check <file>    Impact Check JSON report: marks findings as introduced or pre-existing
  --format <fmt>           analyze/check: markdown (default), json or sarif. derive: dsl (default), calm or json
  --output <file>          Write to a file instead of stdout
  --config <file>          JSON config (default: .architecture-check.json in --cwd, if present)
  --cwd <dir>              Repository root; report paths are relative to it (default: current directory)
  --no-branding            Omit the footer link in Markdown output
  --on-error <fail|pass>   Internal/input errors: fail (default; exit 1/3) or pass (warn, exit 0).
                           Usage errors always exit 2; policy failures always exit 4
  --quiet                  No progress messages on stderr
  -h, --help               Show this help
  -v, --version            Show the version

Default policy: \`check\` fails only on verified high-severity findings (an unusable or unsafe model, a verified
boundary violation). Hypotheses and unknowns never block unless the config opts in.
Exit codes: 0 ok · 1 internal error · 2 usage/config error · 3 input error · 4 policy failure (check)
Privacy: offline; no network access, no telemetry, nothing executed, no model used.
`;

/** Writes an output file atomically (temp file + rename); the parent directory must exist. */
function writeOutput(path: string, content: string): void {
  if (existsSync(path) && statSync(path).isDirectory())
    throw usageError(`--output points to a directory: ${path}`);
  if (!existsSync(dirname(path))) throw usageError(`Output directory does not exist: ${dirname(path)}`);
  const temp = join(dirname(path), `.architecture-check-${process.pid}-${Date.now()}.tmp`);
  writeFileSync(temp, content, { mode: 0o644 });
  renameSync(temp, path);
}

/** Returns the bundled report JSON Schema (works from both src/ and dist/). */
export function readSchema(): string {
  return readFileSync(new URL("../../schema/architecture-check-report.schema.json", import.meta.url), "utf8");
}

/** Rule catalog as a plain-text table. */
function rulesText(): string {
  const rows = Object.values(RULES).map(
    (r) =>
      `${r.id.padEnd(27)} ${r.category.padEnd(13)} ${r.status.padEnd(21)} ${r.severity.padEnd(7)} ${r.title}`
  );
  return `${"rule".padEnd(27)} ${"category".padEnd(13)} ${"status".padEnd(21)} ${"severity".padEnd(7)} title\n${rows.join("\n")}\n`;
}

/** Set by --on-error pass: internal/input errors become warnings with exit 0 (fail-open). */
let failOpen = false;

/** Parses arguments and runs one command. Throws ArchitectureCheckError for expected failures. */
async function main(argv: string[], io: CliIO): Promise<number> {
  const { values, positionals } = (() => {
    try {
      return parseArgs({
        args: argv,
        allowPositionals: true,
        strict: true,
        options: {
          model: { type: "string" },
          graph: { type: "string" },
          "impact-check": { type: "string" },
          format: { type: "string" },
          output: { type: "string" },
          config: { type: "string" },
          cwd: { type: "string" },
          "no-branding": { type: "boolean" },
          "on-error": { type: "string" },
          quiet: { type: "boolean" },
          help: { type: "boolean", short: "h" },
          version: { type: "boolean", short: "v" },
        },
      });
    } catch (error) {
      throw usageError((error as Error).message, "Run `architecture-check --help` for usage.");
    }
  })();

  if (values.help) {
    io.stdout(HELP);
    return ExitCode.Ok;
  }
  if (values.version) {
    io.stdout(`${TOOL_VERSION}\n`);
    return ExitCode.Ok;
  }
  const [command, ...rest] = positionals;
  if (command === undefined) {
    io.stderr(HELP);
    return ExitCode.Usage;
  }
  if (rest.length > 0) throw usageError(`Unexpected argument: ${rest[0] as string}`);
  if (command === "schema" || command === "rules") {
    io.stdout(command === "schema" ? readSchema() : rulesText());
    return ExitCode.Ok;
  }
  if (command !== "derive" && command !== "analyze" && command !== "check")
    throw usageError(`Unknown command: ${command}`, "Commands: derive, analyze, check, rules, schema.");

  const onError = values["on-error"] ?? "fail";
  if (onError !== "fail" && onError !== "pass") throw usageError(`--on-error must be "fail" or "pass"`);
  failOpen = onError === "pass";
  const derive = command === "derive";
  const format = values.format ?? (derive ? "dsl" : "markdown");
  const formats = derive ? ["dsl", "calm", "json"] : ["markdown", "json", "sarif"];
  if (!formats.includes(format)) throw usageError(`--format for ${command} must be ${formats.join(", ")}`);
  if (derive && (values.model !== undefined || values["impact-check"] !== undefined))
    throw usageError("derive takes no --model or --impact-check");
  const cwd = values.cwd ? resolve(io.cwd, values.cwd) : io.cwd;
  if (!existsSync(cwd) || !statSync(cwd).isDirectory())
    throw usageError(`--cwd is not a directory: ${values.cwd ?? cwd}`);

  let config: Config = DEFAULT_CONFIG;
  if (values.config !== undefined)
    config = loadConfigFile(isAbsolute(values.config) ? values.config : resolve(io.cwd, values.config));
  else if (existsSync(join(cwd, ".architecture-check.json")))
    config = loadConfigFile(join(cwd, ".architecture-check.json"));

  const fromCwd = (p: string | undefined): string | null =>
    p === undefined ? null : isAbsolute(p) ? p : resolve(io.cwd, p);
  const report = analyze({
    cwd,
    command,
    config,
    modelPath: fromCwd(values.model),
    graphPath: fromCwd(values.graph),
    impactCheckPath: fromCwd(values["impact-check"]),
    ...(io.now ? { now: io.now } : {}),
  });
  const rendered =
    format === "json"
      ? renderJson(report)
      : format === "sarif"
        ? renderSarif(report)
        : format === "dsl"
          ? renderDsl(report)
          : format === "calm"
            ? renderCalm(report)
            : renderMarkdown(report, { branding: !values["no-branding"] });
  if (values.output !== undefined)
    writeOutput(isAbsolute(values.output) ? values.output : resolve(io.cwd, values.output), rendered);
  else io.stdout(rendered);

  if (!values.quiet) {
    const s = report.summary;
    io.stderr(
      `architecture-check: ${s.as_built_elements} as-built element(s), ${s.as_built_relationships} relationship(s)` +
        (derive ? "" : `, ${s.findings} finding(s)`) +
        (report.policy.evaluated ? `, policy ${report.policy.result}` : "") +
        "\n"
    );
  }
  return report.policy.result === "fail" ? ExitCode.Policy : ExitCode.Ok;
}

/** Runs the CLI and returns the process exit code. Never throws. */
export async function run(argv: string[], io: CliIO): Promise<number> {
  failOpen = false;
  try {
    return await main(argv, io);
  } catch (error) {
    if (error instanceof ArchitectureCheckError) {
      io.stderr(`architecture-check: error: ${error.message}\n`);
      if (error.hint) io.stderr(`architecture-check: hint: ${error.hint}\n`);
      if (failOpen && error.exitCode === ExitCode.Input) {
        io.stderr("architecture-check: warning: --on-error pass: continuing with exit 0\n");
        return ExitCode.Ok;
      }
      return error.exitCode;
    }
    io.stderr(`architecture-check: internal error: ${(error as Error)?.message ?? String(error)}\n`);
    if (failOpen) {
      io.stderr("architecture-check: warning: --on-error pass: continuing with exit 0\n");
      return ExitCode.Ok;
    }
    return ExitCode.Internal;
  }
}
