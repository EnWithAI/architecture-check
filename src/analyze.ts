// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Orchestration: walk the repository, read the optional sibling inputs, load the declared model, build the
 * as-built model, compare, apply the policy and assemble the report (sorted, redacted, capped).
 */
import { isAbsolute, join, relative, sep } from "node:path";
import type { Config } from "./config.js";
import { buildAsBuilt } from "./derive/asbuilt.js";
import { compare, declaredSourceDirectories } from "./drift/compare.js";
import { readGraph, readImpactReport, type ImpactReport, type ModuleGraph } from "./input/inputs.js";
import { exists, walkRepository } from "./input/walk.js";
import { Limitations } from "./limitations.js";
import { loadModel, locateModel, type LoadedModel } from "./model/load.js";
import { evaluatePolicy, notEvaluated } from "./policy.js";
import { redactDeep } from "./report/redact.js";
import type { Finding, Report, Severity, Status } from "./types.js";
import { compareStrings } from "./util/paths.js";
import { TOOL_VERSION } from "./version.js";

/** Options of one run. */
export interface AnalyzeOptions {
  cwd: string;
  command: "derive" | "analyze" | "check";
  config: Config;
  modelPath?: string | null;
  graphPath?: string | null;
  impactCheckPath?: string | null;
  now?: () => Date;
}

const MAX_FINDINGS = 5000;
const MAX_EVIDENCE = 5;
const RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };
const MODEL_KINDS = new Set(["model-element", "model-relationship", "model-construct", "model-reference"]);
/** Report keys whose string values are hashes or enums and are never redacted. */
const NO_REDACT = new Set(["sha256", "id", "rule_id", "status", "kind", "severity", "provenance"]);

function displayPath(cwd: string, file: string): string {
  const rel = relative(cwd, file).split(sep).join("/");
  return rel.startsWith("..") || isAbsolute(rel) ? file : rel;
}

/** Runs derive, analyze or check and returns the report. */
export function analyze(options: AnalyzeOptions): Report {
  const now = options.now ?? (() => new Date());
  const started = now();
  const { cwd, config } = options;
  const limitations = new Limitations();

  const absolute = (p: string | null | undefined): string | null =>
    p === null || p === undefined ? null : isAbsolute(p) ? p : join(cwd, p);
  const graphFile = absolute(options.graphPath ?? config.graph);
  const impactFile = absolute(options.impactCheckPath);
  const graph: ModuleGraph | null =
    graphFile === null ? null : readGraph(graphFile, displayPath(cwd, graphFile));
  const impact: ImpactReport | null =
    impactFile === null ? null : readImpactReport(impactFile, displayPath(cwd, impactFile));

  let loaded: LoadedModel | null = null;
  if (options.command !== "derive") {
    const file = locateModel(cwd, options.modelPath ?? config.model);
    loaded = loadModel(cwd, file, limitations);
    if (loaded.repoPath === null) loaded.info.path = displayPath(cwd, file);
  }

  const exclude = new Set<string>();
  if (loaded?.repoPath) exclude.add(loaded.repoPath);
  for (const p of [graphFile, impactFile]) if (p !== null) exclude.add(displayPath(cwd, p));
  const files = walkRepository(cwd, config.ignore, exclude, limitations, config.respectGitignore);
  if (graph === null) limitations.add("no-module-graph");
  else {
    const missing = graph.modules.filter((m) => !exists(cwd, m.path));
    for (const m of missing) limitations.add("graph-path-mismatch", m.path);
  }

  const extraSources =
    loaded !== null && loaded.model.usable ? declaredSourceDirectories(cwd, loaded.model) : [];
  const asBuilt = buildAsBuilt(cwd, files, config, graph, extraSources, limitations);

  let findings: Finding[] = [];
  let mapping: Report["mapping"] = [];
  let completeMapping: boolean | null = null;
  let ignoredContainers: string[] = [];
  if (loaded !== null) {
    const result = compare({
      root: cwd,
      model: loaded.model,
      modelPath: loaded.info.path,
      modelRepoPath: loaded.repoPath,
      asBuilt,
      config,
      graphPresent: graph !== null,
    });
    findings = result.findings;
    mapping = result.mapping;
    completeMapping = loaded.model.usable ? result.completeMapping : null;
    ignoredContainers = result.ignoredContainers;
  }

  if (impact !== null)
    for (const f of findings)
      f.change_status = f.evidence.some((e) => !MODEL_KINDS.has(e.kind) && impact.changedPaths.has(e.path))
        ? "introduced"
        : "pre-existing";
  findings.sort(
    (a, b) =>
      RANK[b.severity] - RANK[a.severity] ||
      compareStrings(a.rule_id, b.rule_id) ||
      compareStrings(a.subject, b.subject) ||
      compareStrings(a.id, b.id)
  );
  if (findings.length > MAX_FINDINGS) {
    limitations.add("findings-cap");
    findings = findings.slice(0, MAX_FINDINGS);
  }
  for (const f of findings) {
    f.evidence_total = f.evidence.length;
    f.evidence = f.evidence.slice(0, MAX_EVIDENCE);
  }
  const relationships = asBuilt.relationships.map((r) => ({
    ...r,
    evidence: r.evidence.slice(0, MAX_EVIDENCE),
  }));
  const elements = asBuilt.elements.map((e) => ({ ...e, evidence: e.evidence.slice(0, MAX_EVIDENCE) }));

  const byStatus: Record<Status, number> = { verified_static_fact: 0, hypothesis: 0, unknown: 0 };
  const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  const byRule: Record<string, number> = {};
  for (const f of findings) {
    byStatus[f.status]++;
    bySeverity[f.severity]++;
    byRule[f.rule_id] = (byRule[f.rule_id] ?? 0) + 1;
  }
  const policy = options.command === "check" ? evaluatePolicy(findings, config) : notEvaluated(config);
  const finished = now();

  const report: Report = {
    schema_version: "1.1",
    kind: "architecture-check-report",
    tool: { name: "architecture-check", version: TOOL_VERSION },
    command: options.command,
    declared_model: loaded?.info ?? null,
    inputs: { graph: graph?.info ?? null, impact_check: impact?.info ?? null },
    as_built: {
      system_name: config.systemName,
      elements,
      relationships,
      interfaces: asBuilt.interfaces,
    },
    mapping,
    complete_mapping: completeMapping,
    findings,
    summary: {
      findings: findings.length,
      by_status: byStatus,
      by_severity: bySeverity,
      by_rule: Object.fromEntries(Object.entries(byRule).sort(([a], [b]) => compareStrings(a, b))),
      as_built_elements: elements.length,
      as_built_relationships: relationships.length,
      interfaces: asBuilt.interfaces.length,
    },
    policy,
    ignored_containers: ignoredContainers,
    coverage_limitations: limitations.list(),
    run_metadata: {
      generated_at: finished.toISOString(),
      tool_version: TOOL_VERSION,
      node_version: process.version,
      duration_ms: Math.max(0, finished.getTime() - started.getTime()),
    },
  };
  return redactDeep(report, NO_REDACT);
}
