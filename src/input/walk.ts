// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Repository walk (docs/SPEC.md §3.1): lists files without following symbolic links, skips build and dependency
 * directories, configured ignores and git-ignored paths, caps depth and entry count, and classifies deployment, IaC
 * and API files.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { matchesAny } from "../config.js";
import type { Limitations } from "../limitations.js";
import { type GitignoreRule, isGitignored, parseGitignore } from "./gitignore.js";
import { compareStrings, dirOf } from "../util/paths.js";

/** Directories never entered. */
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", "vendor", "target"]);
const MAX_ENTRIES = 20_000;
const MAX_DEPTH = 20;
/** Largest file that is parsed (1 MiB). */
export const MAX_FILE_BYTES = 1024 * 1024;

const OTHER_LANGUAGE = /\.(py|go|java|kt|rb|php|cs|rs|scala|ex|exs)$/;

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
export function isDockerfile(base: string): boolean {
  return (
    base === "Dockerfile" ||
    base === "Containerfile" ||
    base.startsWith("Dockerfile.") ||
    /\.dockerfile$/i.test(base)
  );
}

/** True for compose file base names. */
export function isComposeFile(base: string): boolean {
  return /^(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(base);
}

/** Reads a `.gitignore`-format file as rules for directory `base`; missing, linked or oversized files give none. */
function gitignoreRules(root: string, rel: string, base: string): GitignoreRule[] {
  try {
    const stat = lstatSync(join(root, rel));
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return [];
    return parseGitignore(readFileSync(join(root, rel), "utf8"), base);
  } catch {
    return [];
  }
}

/**
 * Walks the repository under `root`. `exclude` lists repository-relative files never classified. With
 * `respectGitignore`, `.git/info/exclude` and every `.gitignore` on the way down are honoured (D-103).
 */
export function walkRepository(
  root: string,
  ignore: readonly string[],
  exclude: ReadonlySet<string>,
  limitations: Limitations,
  respectGitignore = true
): RepoFiles {
  const files: RepoFiles = {
    all: [],
    directories: new Set(["."]),
    dockerfiles: [],
    compose: [],
    yaml: [],
    apiJson: [],
    otherLanguage: [],
  };
  const helmCharts: string[] = [];
  let entries = 0;
  let capped = false;

  const visit = (dir: string, depth: number, inherited: readonly GitignoreRule[]): void => {
    if (capped) return;
    if (depth > MAX_DEPTH) {
      capped = true;
      limitations.add("file-list-cap", dir);
      return;
    }
    let names: string[];
    try {
      names = readdirSync(dir === "." ? root : join(root, dir)).sort(compareStrings);
    } catch {
      return;
    }
    const rules =
      respectGitignore && names.includes(".gitignore")
        ? [...inherited, ...gitignoreRules(root, dir === "." ? ".gitignore" : `${dir}/.gitignore`, dir)]
        : inherited;
    for (const name of names) {
      const rel = dir === "." ? name : `${dir}/${name}`;
      if (++entries > MAX_ENTRIES) {
        if (!capped) limitations.add("file-list-cap", rel);
        capped = true;
        return;
      }
      if (matchesAny(rel, ignore)) continue;
      let stat;
      try {
        stat = lstatSync(join(root, rel));
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        limitations.add("symlink-skipped", rel);
        continue;
      }
      if (stat.isDirectory() && SKIP_DIRS.has(name)) continue;
      if (rules.length > 0 && isGitignored(rel, stat.isDirectory(), rules)) {
        limitations.add("gitignored-skipped", rel);
        continue;
      }
      if (stat.isDirectory()) {
        files.directories.add(rel);
        if (existsSync(join(root, rel, "Chart.yaml"))) {
          helmCharts.push(rel);
          limitations.add("helm-not-rendered", rel);
          continue;
        }
        visit(rel, depth + 1, rules);
        continue;
      }
      if (!stat.isFile()) continue;
      files.all.push(rel);
      if (exclude.has(rel)) continue;
      if (OTHER_LANGUAGE.test(name)) files.otherLanguage.push(rel);
      if (/\.(tf|tofu)$/.test(name) || name === "Pulumi.yaml" || name === "cdk.json") {
        limitations.add("iac-not-evaluated", rel);
        continue;
      }
      if (/^kustomization\.ya?ml$/.test(name)) {
        limitations.add("kustomize-not-rendered", dirOf(rel));
        continue;
      }
      if (isDockerfile(name)) files.dockerfiles.push(rel);
      else if (isComposeFile(name)) files.compose.push(rel);
      else if (/\.ya?ml$/.test(name)) files.yaml.push(rel);
      else if (/\.json$/i.test(name) && /(openapi|swagger|asyncapi)/i.test(name)) files.apiJson.push(rel);
    }
  };
  visit(".", 0, respectGitignore ? gitignoreRules(root, ".git/info/exclude", ".") : []);
  for (const list of [
    files.all,
    files.dockerfiles,
    files.compose,
    files.yaml,
    files.apiJson,
    files.otherLanguage,
  ])
    list.sort(compareStrings);
  return files;
}

/** Reads a repository file as UTF-8 text for parsing, or null (with a limitation) when too large or not UTF-8. */
export function readText(root: string, rel: string, limitations: Limitations): string | null {
  let buffer: Buffer;
  try {
    const stat = lstatSync(join(root, rel));
    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_BYTES) {
      limitations.add("file-too-large", rel);
      return null;
    }
    buffer = readFileSync(join(root, rel));
  } catch {
    return null;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (text.includes("\u0000")) throw new Error("NUL");
    return text.replace(/^\ufeff/, "");
  } catch {
    limitations.add("file-not-utf8", rel);
    return null;
  }
}

/** True when a repository-relative path is an existing directory (never following symbolic links). */
export function isDirectory(root: string, rel: string): boolean {
  try {
    return lstatSync(rel === "." ? root : join(root, rel)).isDirectory();
  } catch {
    return false;
  }
}

/** True when a repository-relative path exists (never following symbolic links). */
export function exists(root: string, rel: string): boolean {
  try {
    lstatSync(rel === "." ? root : join(root, rel));
    return true;
  } catch {
    return false;
  }
}
