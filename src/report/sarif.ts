// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * SARIF 2.1.0 reporter for code-scanning tools. Levels: high → error, medium → warning, low/info → note.
 * Status, confidence and is_heuristic are kept in result properties so hypotheses stay labelled. Evidence without a
 * line (directories) has no region.
 */
import { RULES } from "../drift/rules.js";
import type { Report, Severity } from "../types.js";

const LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

/** Renders a report as a SARIF 2.1.0 log (one run). */
export function renderSarif(report: Report): string {
  const ruleIds = Object.keys(RULES).sort();
  const log = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "architecture-check",
            semanticVersion: report.run_metadata.tool_version,
            rules: ruleIds.map((id) => {
              const rule = RULES[id] as (typeof RULES)[string];
              return {
                id,
                name: id,
                shortDescription: { text: rule.title },
                fullDescription: { text: rule.explanation },
                help: { text: rule.action },
                defaultConfiguration: { level: LEVEL[rule.severity] },
                properties: { category: rule.category, status: rule.status },
              };
            }),
          },
        },
        results: report.findings.map((f) => ({
          ruleId: f.rule_id,
          ruleIndex: ruleIds.indexOf(f.rule_id),
          level: LEVEL[f.severity],
          message: { text: `${f.summary}. ${f.recommended_human_action}` },
          locations: f.evidence.map((e) => ({
            physicalLocation: {
              artifactLocation: { uri: e.path.split("/").map(encodeURIComponent).join("/") },
              ...(e.line_start === null
                ? {}
                : { region: { startLine: e.line_start, endLine: e.line_end ?? e.line_start } }),
            },
          })),
          partialFingerprints: { "architectureCheckFindingId/v1": f.id },
          properties: {
            status: f.status,
            confidence: f.confidence,
            is_heuristic: f.is_heuristic,
            subject: f.subject,
            change_status: f.change_status,
          },
        })),
        properties: {
          policy: report.policy.result,
          limitations: report.coverage_limitations.map((l) => l.code),
        },
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
