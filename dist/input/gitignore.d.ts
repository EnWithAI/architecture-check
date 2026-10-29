/**
 * `.gitignore` matching (docs/SPEC.md §3.1, D-103), in process: git is never run. Supports comments, escapes,
 * negation, directory-only and anchored patterns, `*`, `?`, `[...]` and `**`, with the last matching rule winning.
 * As in git, a path under an ignored directory cannot be re-included (the walk never enters that directory).
 */
/** One pattern from a `.gitignore` file. */
export interface GitignoreRule {
    /** Directory holding the `.gitignore` file, repository-relative (`.` for the root). */
    base: string;
    negate: boolean;
    dirOnly: boolean;
    regex: RegExp;
}
/** Parses the text of a `.gitignore` file located in repository directory `base`. */
export declare function parseGitignore(text: string, base: string): GitignoreRule[];
/** True when the last rule matching `rel` (repository-relative) ignores it. Rules are in precedence order. */
export declare function isGitignored(rel: string, isDir: boolean, rules: readonly GitignoreRule[]): boolean;
