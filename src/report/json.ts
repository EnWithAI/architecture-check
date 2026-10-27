// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * JSON reporter: the report object, pretty-printed with a trailing newline (key order follows the schema).
 */
import type { Report } from "../types.js";

/** Serializes a report as stable, pretty-printed JSON. */
export function renderJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
