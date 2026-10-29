import type { Severity, Status } from "./types.js";
/** Validated configuration. */
export interface Config {
    model: string | null;
    graph: string | null;
    systemName: string;
    ignore: string[];
    respectGitignore: boolean;
    ignoreContainers: string[];
    externalSdks: Record<string, string>;
    failOnSeverity: Severity | "never";
    failOnStatuses: Status[];
}
/** Defaults: no ignores beyond git's, policy fails on verified high findings only. */
export declare const DEFAULT_CONFIG: Config;
/** Validates a parsed config object. */
export declare function validateConfig(raw: unknown): Config;
/** Reads and validates a JSON config file. */
export declare function loadConfigFile(path: string): Config;
/** Convert a simple glob (`*`, `**`, `?`) to an anchored RegExp. No user regex syntax is honored. */
export declare function globToRegExp(glob: string): RegExp;
/** True when the path matches at least one glob. */
export declare function matchesAny(path: string, patterns: readonly string[]): boolean;
