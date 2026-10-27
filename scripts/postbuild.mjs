// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Build step: marks the compiled CLI and Action entry points as executable.
 */
import { chmodSync } from "node:fs";
chmodSync(new URL("../dist/cli/main.js", import.meta.url), 0o755);
chmodSync(new URL("../dist/action/main.js", import.meta.url), 0o755);
