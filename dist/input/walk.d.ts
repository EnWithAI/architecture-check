import type { Limitations } from "../limitations.js";
/** Largest file that is parsed (1 MiB). */
export declare const MAX_FILE_BYTES: number;
/** Files of interest, by kind (repository-relative paths, sorted). */
export interface RepoFiles {
    all: string[];
    directories: Set<string>;
    dockerfiles: string[];
    compose: string[];
    yaml: string[];
    apiJson: string[];
    otherLanguage: string[];
}
/** True for Dockerfile-like base names. */
export declare function isDockerfile(base: string): boolean;
/** True for compose file base names. */
export declare function isComposeFile(base: string): boolean;
/**
 * Walks the repository under `root`. `exclude` lists repository-relative files never classified. With
 * `respectGitignore`, `.git/info/exclude` and every `.gitignore` on the way down are honoured (D-103).
 */
export declare function walkRepository(root: string, ignore: readonly string[], exclude: ReadonlySet<string>, limitations: Limitations, respectGitignore?: boolean): RepoFiles;
/** Reads a repository file as UTF-8 text for parsing, or null (with a limitation) when too large or not UTF-8. */
export declare function readText(root: string, rel: string, limitations: Limitations): string | null;
/** True when a repository-relative path is an existing directory (never following symbolic links). */
export declare function isDirectory(root: string, rel: string): boolean;
/** True when a repository-relative path exists (never following symbolic links). */
export declare function exists(root: string, rel: string): boolean;
