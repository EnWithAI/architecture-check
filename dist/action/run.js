// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * GitHub Action runner (docs/ACTION.md). Reads inputs from INPUT_* environment variables (never from shell
 * interpolation), runs `check` in-process, writes JSON/Markdown/SARIF files, the job summary and step outputs.
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { analyze } from "../analyze.js";
import { DEFAULT_CONFIG, loadConfigFile } from "../config.js";
import { ArchitectureCheckError, ExitCode } from "../errors.js";
import { renderJson } from "../report/json.js";
import { renderMarkdown } from "../report/markdown.js";
import { renderSarif } from "../report/sarif.js";
/** Rejects absolute paths and `..` segments in workspace-relative inputs. */
function relativeInput(value, name) {
    const normalized = value.trim().replace(/\\/g, "/");
    if (normalized === "" || isAbsolute(normalized) || normalized.split("/").includes(".."))
        throw new ArchitectureCheckError(`Input ${name} must be a relative path inside the workspace`, ExitCode.Usage);
    return normalized;
}
/** Appends `name=value` to the step outputs file when available. */
function setOutput(io, name, value) {
    const file = io.env["GITHUB_OUTPUT"];
    if (file)
        appendFileSync(file, `${name}=${value.replace(/[\r\n]/g, " ")}\n`);
}
/** Runs the action; returns the process exit code. */
export function runAction(io) {
    const input = (name, fallback) => io.env[`INPUT_${name}`]?.trim() || fallback;
    const failOnPolicy = input("FAIL_ON_POLICY", "false") === "true";
    const onErrorInput = input("ON_ERROR", "auto");
    const failClosed = onErrorInput === "fail" || (onErrorInput === "auto" && failOnPolicy);
    try {
        if (!["auto", "fail", "warn"].includes(onErrorInput))
            throw new ArchitectureCheckError("Input on-error must be auto, fail or warn", ExitCode.Usage);
        if (!["true", "false"].includes(input("FAIL_ON_POLICY", "false")))
            throw new ArchitectureCheckError("Input fail-on-policy must be true or false", ExitCode.Usage);
        const workspace = io.env["GITHUB_WORKSPACE"] ?? process.cwd();
        const cwd = resolve(workspace, relativeInput(input("WORKING_DIRECTORY", "."), "working-directory"));
        const optional = (name, label) => {
            const value = input(name, "");
            return value === "" ? null : join(cwd, relativeInput(value, label));
        };
        const configPath = relativeInput(input("CONFIG_PATH", ".architecture-check.json"), "config-path");
        let config = DEFAULT_CONFIG;
        if (existsSync(join(cwd, configPath)))
            config = loadConfigFile(join(cwd, configPath));
        const report = analyze({
            cwd,
            command: "check",
            config,
            modelPath: optional("MODEL", "model"),
            graphPath: optional("GRAPH", "graph"),
            impactCheckPath: optional("IMPACT_CHECK", "impact-check"),
        });
        const rel = input("OUTPUT_DIR", "architecture-check-report");
        const outDir = resolve(workspace, relativeInput(rel, "output-dir"));
        mkdirSync(outDir, { recursive: true });
        const markdown = renderMarkdown(report, { branding: true });
        writeFileSync(join(outDir, "architecture-check-report.json"), renderJson(report));
        writeFileSync(join(outDir, "architecture-check-report.md"), markdown);
        writeFileSync(join(outDir, "architecture-check-report.sarif"), renderSarif(report));
        if (io.env["GITHUB_STEP_SUMMARY"])
            appendFileSync(io.env["GITHUB_STEP_SUMMARY"], markdown);
        setOutput(io, "report-json", `${rel}/architecture-check-report.json`);
        setOutput(io, "report-markdown", `${rel}/architecture-check-report.md`);
        setOutput(io, "report-sarif", `${rel}/architecture-check-report.sarif`);
        setOutput(io, "findings", String(report.summary.findings));
        setOutput(io, "high-findings", String(report.summary.by_severity.high));
        setOutput(io, "policy", report.policy.result === "fail" ? "failed" : "passed");
        setOutput(io, "status", "ok");
        io.log(`architecture-check: ${report.summary.findings} finding(s), policy ${report.policy.result}`);
        if (report.policy.result === "fail") {
            io.log(`::${failOnPolicy ? "error" : "warning"}::Architecture Check policy failed (${report.policy.violations.length} violation(s))`);
            return failOnPolicy ? ExitCode.Policy : ExitCode.Ok;
        }
        return ExitCode.Ok;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const usage = error instanceof ArchitectureCheckError && error.exitCode === ExitCode.Usage;
        setOutput(io, "status", "error");
        if (usage || failClosed) {
            io.log(`::error::Architecture Check failed: ${message.replace(/[\r\n]/g, " ")}`);
            return error instanceof ArchitectureCheckError ? error.exitCode : ExitCode.Internal;
        }
        io.log(`::warning::Architecture Check could not run (fail-open, on-error=${onErrorInput}): ${message.replace(/[\r\n]/g, " ")}`);
        return ExitCode.Ok;
    }
}
