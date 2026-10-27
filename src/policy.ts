// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Policy evaluation for `architecture-check check`. By default only verified high-severity findings block
 * (docs/SPEC.md §5); hypotheses block only when the config opts in.
 */
import type { Config } from "./config.js";
import type { Finding, PolicyResult, Severity } from "./types.js";

const RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };

/** Applies the configured policy to the findings. */
export function evaluatePolicy(findings: Finding[], config: Config): PolicyResult {
  const threshold = config.failOnSeverity;
  const violations =
    threshold === "never"
      ? []
      : findings
          .filter((f) => RANK[f.severity] >= RANK[threshold] && config.failOnStatuses.includes(f.status))
          .map((f) => f.id);
  return {
    evaluated: true,
    result: violations.length > 0 ? "fail" : "pass",
    fail_on_severity: threshold,
    fail_on_statuses: [...config.failOnStatuses],
    violations,
  };
}

/** Policy block for `analyze` (findings never fail the run). */
export function notEvaluated(config: Config): PolicyResult {
  return {
    evaluated: false,
    result: "not_evaluated",
    fail_on_severity: config.failOnSeverity,
    fail_on_statuses: [...config.failOnStatuses],
    violations: [],
  };
}
