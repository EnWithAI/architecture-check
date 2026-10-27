/**
 * FINOS CALM architecture reader (docs/SPEC.md §3.6): nodes, `connects`/`interacts`/`composed-of`/`deployed-in`
 * relationships, `adrs` and the `commons.*` metadata keys. Line numbers come from the first
 * `"unique-id": "<id>"` occurrence in the text.
 */
import type { Limitations } from "../limitations.js";
import { type DeclaredModel } from "./types.js";
/** Reads a CALM architecture document into the declared IR. */
export declare function readCalm(text: string, modelPath: string, limitations: Limitations): DeclaredModel;
