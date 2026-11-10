/**
 * Structurizr DSL subset reader (docs/SPEC.md §3.6). Line-oriented: people, software systems, containers,
 * components, relationships, properties and `!identifiers`. Code-bearing or remote constructs (`!script`,
 * `!plugin`, URL `!include`, `workspace extends`) are refused and never evaluated; anything else outside the
 * subset is skipped and reported as a limitation.
 */
import type { Limitations } from "../limitations.js";
import { type DeclaredModel } from "./types.js";
interface Token {
    text: string;
    quoted: boolean;
}
interface Statement {
    line: number;
    tokens: Token[];
}
/** Splits DSL text into per-line token lists; null when a string or block comment is unterminated. */
export declare function tokenize(text: string): Statement[] | null;
/** Reads a Structurizr DSL workspace into the declared IR. */
export declare function readDsl(text: string, modelPath: string, limitations: Limitations): DeclaredModel;
export {};
