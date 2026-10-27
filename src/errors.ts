// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Error types and documented process exit codes. Every expected failure is a ArchitectureCheckError carrying an exit
 * code and an optional remediation hint; anything else is treated as an internal bug (exit 1).
 */
export const ExitCode = {
  Ok: 0,
  Internal: 1,
  Usage: 2,
  Input: 3,
  Policy: 4,
} as const;

/** One of the documented exit codes. */
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

/** An expected, user-facing error with a defined exit code and optional remediation hint. */
export class ArchitectureCheckError extends Error {
  readonly exitCode: ExitCodeValue;
  readonly hint: string | undefined;

  constructor(message: string, exitCode: ExitCodeValue, hint?: string) {
    super(message);
    this.name = "ArchitectureCheckError";
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

/** Creates a usage/configuration error (exit 2). */
export const usageError = (message: string, hint?: string): ArchitectureCheckError =>
  new ArchitectureCheckError(message, ExitCode.Usage, hint);

/** Creates an input error: no model found, or an input cannot be read or has the wrong version (exit 3). */
export const inputError = (message: string, hint?: string): ArchitectureCheckError =>
  new ArchitectureCheckError(message, ExitCode.Input, hint);
