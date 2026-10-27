/**
 * Coverage limitations: known gaps in what was analyzed. Every code has a fixed message; occurrences are counted
 * and their paths listed (sorted, at most 50), so nothing missing is silently treated as "no drift".
 */
import type { Limitation } from "./types.js";
/** Message for every limitation code. */
export declare const LIMITATION_MESSAGES: Readonly<Record<string, string>>;
/** Collects limitation occurrences during a run. */
export declare class Limitations {
    private readonly entries;
    /** Records one occurrence, optionally with a path. */
    add(code: string, path?: string): void;
    /** True when a code was recorded. */
    has(code: string): boolean;
    /** Sorted list for the report (`static-analysis-only` is always present). */
    list(): Limitation[];
}
