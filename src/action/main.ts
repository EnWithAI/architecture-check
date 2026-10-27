// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Executable entry point of the GitHub Action (action.yml). Delegates to runAction() and sets the exit code.
 */
import { runAction } from "./run.js";

process.exitCode = runAction({ env: process.env, log: (text) => process.stdout.write(`${text}\n`) });
