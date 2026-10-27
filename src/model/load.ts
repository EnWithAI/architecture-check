// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Locates and reads the declared model (docs/SPEC.md §3.6): `--model`, config `model`, or the first default
 * location that exists. `.dsl` is Structurizr DSL, `.json` is CALM.
 */
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { inputError } from "../errors.js";
import type { Limitations } from "../limitations.js";
import type { DeclaredModelInfo } from "../types.js";
import { sha256 } from "../util/paths.js";
import { readCalm } from "./calm.js";
import { readDsl } from "./dsl.js";
import type { DeclaredModel } from "./types.js";

/** Default model locations, in order. */
export const DEFAULT_MODEL_PATHS = [
  "architecture/workspace.dsl",
  "architecture/calm.json",
  "architecture/architecture.json",
  "workspace.dsl",
  "docs/architecture/workspace.dsl",
  "docs/architecture/calm.json",
];

const MAX_MODEL_BYTES = 1024 * 1024;

/** The model, its report block and its repository-relative path (null when outside the root). */
export interface LoadedModel {
  model: DeclaredModel;
  info: DeclaredModelInfo;
  repoPath: string | null;
}

/** Finds the model file: explicit path (relative to `cwd`) or the first default that exists under `root`. */
export function locateModel(root: string, explicit: string | null): string {
  if (explicit !== null) return isAbsolute(explicit) ? explicit : join(root, explicit);
  for (const candidate of DEFAULT_MODEL_PATHS) {
    try {
      if (lstatSync(join(root, candidate)).isFile()) return join(root, candidate);
    } catch {
      /* not there */
    }
  }
  throw inputError(
    `No declared model found (looked for ${DEFAULT_MODEL_PATHS.join(", ")})`,
    "Pass --model, or run `architecture-check derive --format dsl` to start one from the as-built model."
  );
}

/** Reads and parses the model file. */
export function loadModel(root: string, file: string, limitations: Limitations): LoadedModel {
  const rel = relative(root, file).split(sep).join("/");
  const repoPath = rel.startsWith("..") || isAbsolute(rel) ? null : rel;
  const display = repoPath ?? file;
  let buffer: Buffer;
  try {
    const stat = lstatSync(file);
    if (!stat.isFile()) throw new Error("not a file");
    if (stat.size > MAX_MODEL_BYTES) throw inputError(`Model is larger than 1 MiB: ${display}`);
    buffer = readFileSync(file);
  } catch (error) {
    if (error instanceof Error && error.name === "ArchitectureCheckError") throw error;
    throw inputError(`Cannot read model: ${display}`);
  }
  const text = buffer.toString("utf8").replace(/^\ufeff/, "");
  let format: "dsl" | "calm";
  if (/\.dsl$/i.test(file)) format = "dsl";
  else if (/\.json$/i.test(file)) format = "calm";
  else throw inputError(`Unknown model format (expected .dsl or .json): ${display}`);
  const model = format === "dsl" ? readDsl(text, display, limitations) : readCalm(text, display, limitations);
  return {
    model,
    repoPath,
    info: {
      path: display,
      format,
      schema: model.schema,
      sha256: sha256(buffer),
      usable: model.usable,
      elements: model.elements.length,
      relationships: model.relationships.length,
    },
  };
}
