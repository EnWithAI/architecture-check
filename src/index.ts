// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Library entry point: programmatic runs, renderers, config validation and the rule catalog.
 */
export { analyze, type AnalyzeOptions } from "./analyze.js";
export { DEFAULT_CONFIG, loadConfigFile, validateConfig, type Config } from "./config.js";
export { RULES, type Rule } from "./drift/rules.js";
export { ArchitectureCheckError, ExitCode } from "./errors.js";
export { renderJson } from "./report/json.js";
export { renderMarkdown } from "./report/markdown.js";
export { renderCalm, renderDsl } from "./report/model-writers.js";
export { renderSarif } from "./report/sarif.js";
export type * from "./types.js";
export { TOOL_VERSION } from "./version.js";
