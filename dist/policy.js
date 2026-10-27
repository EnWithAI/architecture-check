const RANK = { high: 3, medium: 2, low: 1, info: 0 };
/** Applies the configured policy to the findings. */
export function evaluatePolicy(findings, config) {
    const threshold = config.failOnSeverity;
    const violations = threshold === "never"
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
export function notEvaluated(config) {
    return {
        evaluated: false,
        result: "not_evaluated",
        fail_on_severity: config.failOnSeverity,
        fail_on_statuses: [...config.failOnStatuses],
        violations: [],
    };
}
