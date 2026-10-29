/**
 * Policy evaluation for `architecture-check check`. By default only verified high-severity findings block
 * (docs/SPEC.md §5); hypotheses block only when the config opts in.
 */
import type { Config } from "./config.js";
import type { Finding, PolicyResult } from "./types.js";
/** Applies the configured policy to the findings. */
export declare function evaluatePolicy(findings: Finding[], config: Config): PolicyResult;
/** Policy block for `analyze` (findings never fail the run). */
export declare function notEvaluated(config: Config): PolicyResult;
