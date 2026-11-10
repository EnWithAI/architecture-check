// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Small helpers shared by every module: deterministic string comparison, repository-relative path handling,
 * name normalization, identifier slugs and hashing.
 */
import { createHash } from "node:crypto";
import { posix } from "node:path";
/** Compares by UTF-16 code unit (locale-independent, deterministic). */
export function compareStrings(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** Sorted copy without duplicates. */
export function uniqueSorted(values) {
    return [...new Set(values)].sort(compareStrings);
}
/**
 * Normalizes a repository-relative path: `/` separators, no `./`, no trailing `/`, `.` for the root. Returns null when
 * the path is absolute or escapes the root.
 */
export function normalizeRelative(path) {
    const slashed = path.trim().replace(/\\/g, "/");
    if (slashed === "")
        return null;
    if (slashed.startsWith("/") || /^[A-Za-z]:\//.test(slashed))
        return null;
    const normalized = posix.normalize(slashed).replace(/\/+$/, "");
    if (normalized === ".." || normalized.startsWith("../"))
        return null;
    return normalized === "" ? "." : normalized;
}
/** Joins repository-relative paths and normalizes the result (null when it escapes the root). */
export function joinRelative(dir, path) {
    return normalizeRelative(posix.join(dir === "." ? "" : dir, path) || ".");
}
/** Directory part of a repository-relative path (`.` for top-level files). */
export function dirOf(path) {
    const d = posix.dirname(path);
    return d === "" ? "." : d;
}
/** True when `path` is `dir` or lies inside it. */
export function contains(dir, path) {
    return dir === "." || path === dir || path.startsWith(`${dir}/`);
}
/** Lower case, letters and digits only: used for name matching. */
export function normalizeName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
/** A DSL/CALM-safe identifier derived from a name: `[a-z0-9_]`, starting with a letter. */
export function slug(name) {
    let s = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    if (s === "")
        s = "element";
    if (!/^[a-z]/.test(s))
        s = `e_${s}`;
    return s.slice(0, 60);
}
/** Hex SHA-256 of a string or buffer. */
export function sha256(data) {
    return createHash("sha256").update(data).digest("hex");
}
