/**
 * The rule catalog (docs/SPEC.md §5): id, category, default status and severity, title, explanation and the
 * recommended human action. `architecture-check rules` prints it; SARIF embeds it.
 */
import type { Severity, Status } from "../types.js";
/** A rule definition. */
export interface Rule {
    id: string;
    category: "integrity" | "coverage" | "relationships" | "technology";
    status: Status;
    severity: Severity;
    title: string;
    explanation: string;
    action: string;
}
/** Every rule, by id. */
export declare const RULES: Readonly<Record<string, Rule>>;
