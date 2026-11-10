/**
 * The declared model in one intermediate representation, whichever format (Structurizr DSL subset or CALM JSON)
 * it was read from (docs/SPEC.md §3.6).
 */
import type { ElementKind } from "../types.js";
/** A declared element. */
export interface DeclaredElement {
    id: string;
    kind: ElementKind;
    name: string;
    technology: string | null;
    parent: string | null;
    line: number;
    sources: string[];
    allowedDependencies: string[] | null;
    ignore: boolean;
}
/** A declared relationship. */
export interface DeclaredRelationship {
    from: string;
    to: string;
    line: number;
    description: string;
}
/** A problem in the model itself. */
export interface ModelIssue {
    rule: "model-invalid" | "model-reference-invalid" | "model-stale-reference";
    subject: string;
    line: number;
    detail: string;
}
/** A file path the model refers to (ADRs, docs), checked for existence. */
export interface ModelPathReference {
    path: string;
    line: number;
}
/** The parsed declared model. */
export interface DeclaredModel {
    format: "dsl" | "calm";
    schema: string | null;
    usable: boolean;
    elements: DeclaredElement[];
    relationships: DeclaredRelationship[];
    issues: ModelIssue[];
    pathReferences: ModelPathReference[];
}
/** Splits a property value list (`a, b` in DSL; string or array in CALM). */
export declare function propertyList(value: unknown): string[];
/** True for `true` or `"true"` (any case). */
export declare function propertyTrue(value: unknown): boolean;
