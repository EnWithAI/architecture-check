import type { Config } from "../config.js";
import { type AsBuilt } from "../derive/asbuilt.js";
import type { DeclaredModel } from "../model/types.js";
import type { Evidence, Finding, MappingEntry, Severity, Status } from "../types.js";
/** Inputs of the comparison. */
export interface CompareInput {
    root: string;
    model: DeclaredModel;
    modelPath: string;
    modelRepoPath: string | null;
    asBuilt: AsBuilt;
    config: Config;
    graphPresent: boolean;
}
/** Result of the comparison. */
export interface CompareResult {
    mapping: MappingEntry[];
    completeMapping: boolean;
    ignoredContainers: string[];
    findings: Finding[];
}
/** Declared container source values that are existing directories (become `declared-source` containers). */
export declare function declaredSourceDirectories(root: string, model: DeclaredModel): string[];
/** Creates a finding with a deterministic id (rule id + subject, no line numbers). */
export declare function makeFinding(ruleId: string, subject: string, options: {
    summary: string;
    evidence: Evidence[];
    status?: Status;
    severity?: Severity;
    declared?: string[];
    asBuilt?: string[];
    suggested?: string | null;
}): Finding;
/** Maps, lifts and evaluates every rule. */
export declare function compare(input: CompareInput): CompareResult;
