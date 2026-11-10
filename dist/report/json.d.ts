/**
 * JSON reporter: the report object, pretty-printed with a trailing newline (key order follows the schema).
 */
import type { Report } from "../types.js";
/** Serializes a report as stable, pretty-printed JSON. */
export declare function renderJson(report: Report): string;
