import type { Limitations } from "../limitations.js";
import type { DeclaredModelInfo } from "../types.js";
import type { DeclaredModel } from "./types.js";
/** Default model locations, in order. */
export declare const DEFAULT_MODEL_PATHS: string[];
/** The model, its report block and its repository-relative path (null when outside the root). */
export interface LoadedModel {
    model: DeclaredModel;
    info: DeclaredModelInfo;
    repoPath: string | null;
}
/** Finds the model file: explicit path (relative to `cwd`) or the first default that exists under `root`. */
export declare function locateModel(root: string, explicit: string | null): string;
/** Reads and parses the model file. */
export declare function loadModel(root: string, file: string, limitations: Limitations): LoadedModel;
