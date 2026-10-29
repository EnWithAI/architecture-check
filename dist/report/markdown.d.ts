/**
 * Markdown reporter. Every repository- or model-derived string is untrusted: names, paths and ids go into code
 * spans, free text is escaped, @mentions are neutralized and control/bidi characters made visible
 * (src/report/escape.ts).
 */
import type { Report } from "../types.js";
/** Rendering options. */
export interface MarkdownOptions {
    branding: boolean;
}
/** Renders the report as GitHub-flavoured Markdown (capped at 60k characters). */
export declare function renderMarkdown(report: Report, options: MarkdownOptions): string;
