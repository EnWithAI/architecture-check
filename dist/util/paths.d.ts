/** Compares by UTF-16 code unit (locale-independent, deterministic). */
export declare function compareStrings(a: string, b: string): number;
/** Sorted copy without duplicates. */
export declare function uniqueSorted(values: Iterable<string>): string[];
/**
 * Normalizes a repository-relative path: `/` separators, no `./`, no trailing `/`, `.` for the root. Returns null when
 * the path is absolute or escapes the root.
 */
export declare function normalizeRelative(path: string): string | null;
/** Joins repository-relative paths and normalizes the result (null when it escapes the root). */
export declare function joinRelative(dir: string, path: string): string | null;
/** Directory part of a repository-relative path (`.` for top-level files). */
export declare function dirOf(path: string): string;
/** True when `path` is `dir` or lies inside it. */
export declare function contains(dir: string, path: string): boolean;
/** Lower case, letters and digits only: used for name matching. */
export declare function normalizeName(name: string): string;
/** A DSL/CALM-safe identifier derived from a name: `[a-z0-9_]`, starting with a letter. */
export declare function slug(name: string): string;
/** Hex SHA-256 of a string or buffer. */
export declare function sha256(data: string | Buffer): string;
