// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Configuration (`.architecture-check.json`, docs/CONFIG.md): strict validation (unknown keys are usage errors),
 * defaults, and the simple glob matcher used for `ignore`.
 */
import { readFileSync } from "node:fs";
import { usageError } from "./errors.js";
import type { Severity, Status } from "./types.js";

/** Validated configuration. */
export interface Config {
  model: string | null;
  graph: string | null;
  systemName: string;
  ignore: string[];
  respectGitignore: boolean;
  ignoreContainers: string[];
  externalSdks: Record<string, string>;
  failOnSeverity: Severity | "never";
  failOnStatuses: Status[];
}

/** Defaults: no ignores beyond git's, policy fails on verified high findings only. */
export const DEFAULT_CONFIG: Config = Object.freeze({
  model: null,
  graph: null,
  systemName: "As-built system",
  ignore: [],
  respectGitignore: true,
  ignoreContainers: [],
  externalSdks: {},
  failOnSeverity: "high",
  failOnStatuses: ["verified_static_fact"],
}) as Config;

const TOP_KEYS = new Set([
  "model",
  "graph",
  "system_name",
  "ignore",
  "respect_gitignore",
  "ignore_containers",
  "external_sdks",
  "policy",
]);
const SEVERITIES = new Set(["high", "medium", "low", "info", "never"]);
const STATUSES = new Set(["verified_static_fact", "hypothesis", "unknown"]);

function stringList(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v.trim() === ""))
    throw usageError(`Config "${key}" must be an array of non-empty strings`);
  return [...(value as string[])];
}

function optionalString(value: unknown, key: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "") throw usageError(`Config "${key}" must be a string`);
  return value;
}

/** Validates a parsed config object. */
export function validateConfig(raw: unknown): Config {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    throw usageError("Config must be a JSON object");
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) if (!TOP_KEYS.has(key)) throw usageError(`Unknown config key "${key}"`);
  const config: Config = { ...DEFAULT_CONFIG, ignore: [], ignoreContainers: [], externalSdks: {} };
  config.model = optionalString(obj["model"], "model");
  config.graph = optionalString(obj["graph"], "graph");
  if (obj["system_name"] !== undefined) {
    const name = optionalString(obj["system_name"], "system_name");
    if (name === null || name.length > 200) throw usageError(`Config "system_name" must be 1–200 characters`);
    config.systemName = name;
  }
  if (obj["ignore"] !== undefined) config.ignore = stringList(obj["ignore"], "ignore");
  if (obj["respect_gitignore"] !== undefined) {
    if (typeof obj["respect_gitignore"] !== "boolean")
      throw usageError(`Config "respect_gitignore" must be true or false`);
    config.respectGitignore = obj["respect_gitignore"];
  }
  if (obj["ignore_containers"] !== undefined)
    config.ignoreContainers = stringList(obj["ignore_containers"], "ignore_containers");
  if (obj["external_sdks"] !== undefined) {
    const sdks = obj["external_sdks"];
    if (sdks === null || typeof sdks !== "object" || Array.isArray(sdks))
      throw usageError(`Config "external_sdks" must be an object of package → vendor name`);
    for (const [pkg, vendor] of Object.entries(sdks)) {
      if (typeof vendor !== "string" || vendor.trim() === "" || pkg.trim() === "")
        throw usageError(`Config "external_sdks" entries must map a package to a non-empty vendor name`);
      config.externalSdks[pkg] = vendor;
    }
  }
  if (obj["policy"] !== undefined) {
    const policy = obj["policy"];
    if (policy === null || typeof policy !== "object" || Array.isArray(policy))
      throw usageError(`Config "policy" must be an object`);
    const p = policy as Record<string, unknown>;
    for (const key of Object.keys(p))
      if (key !== "fail_on_severity" && key !== "fail_on_statuses")
        throw usageError(`Unknown config key "policy.${key}"`);
    if (p["fail_on_severity"] !== undefined) {
      if (typeof p["fail_on_severity"] !== "string" || !SEVERITIES.has(p["fail_on_severity"]))
        throw usageError(`Config "policy.fail_on_severity" must be high, medium, low, info or never`);
      config.failOnSeverity = p["fail_on_severity"] as Config["failOnSeverity"];
    }
    if (p["fail_on_statuses"] !== undefined) {
      const statuses = stringList(p["fail_on_statuses"], "policy.fail_on_statuses");
      if (statuses.length === 0 || statuses.some((s) => !STATUSES.has(s)))
        throw usageError(
          `Config "policy.fail_on_statuses" must list verified_static_fact, hypothesis and/or unknown`
        );
      config.failOnStatuses = statuses as Status[];
    }
  }
  return config;
}

/** Reads and validates a JSON config file. */
export function loadConfigFile(path: string): Config {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw usageError(`Cannot read config file: ${path}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw usageError(`Config file is not valid JSON: ${(error as Error).message}`);
  }
  return validateConfig(raw);
}

/** Convert a simple glob (`*`, `**`, `?`) to an anchored RegExp. No user regex syntax is honored. */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i] as string;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        out += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/** True when the path matches at least one glob. */
export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((g) => globToRegExp(g).test(path));
}
