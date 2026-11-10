/**
 * Writers for the as-built model (docs/SPEC.md §6): Structurizr DSL and FINOS CALM 1.3 JSON. Identifiers are
 * generated (`[a-z0-9_]`), never copied from the repository; names and descriptions are quoted and escaped, so
 * crafted names cannot inject DSL. The layout is fixed by test/acceptance/expected/a1.dsl, a10.dsl and
 * a10.calm.json.
 */
import type { AsBuiltElement, Report } from "../types.js";
/** Description of the generated system. */
export declare const SYSTEM_DESCRIPTION = "Derived by Architecture Check from static evidence. Review before adopting it as the declared model.";
/** DSL string literal: control characters removed, backslashes and quotes escaped, secrets masked. */
export declare function dslString(value: string): string;
/** Container description: descriptor files, or the origin when there are none. */
export declare function elementDescription(el: AsBuiltElement): string;
/** The value written as `commons.source`. */
export declare function elementSource(el: AsBuiltElement): string;
/** Renders the as-built model as a Structurizr DSL workspace. */
export declare function renderDsl(report: Report): string;
/** Renders the as-built model as a CALM 1.3 architecture document. */
export declare function renderCalm(report: Report): string;
