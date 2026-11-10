// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Readers for the sibling files: the Impact Check module graph (graph schema 1.0, D-081) and the Impact Check
 * report (schema 2.0, for `change_status`). Only documented fields are read; other versions are rejected (exit 3).
 */
import { readFileSync, statSync } from "node:fs";
import { inputError } from "../errors.js";
import { sha256 } from "../util/paths.js";
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
function readJson(path, displayPath, what) {
    let text;
    try {
        if (statSync(path).size > MAX_INPUT_BYTES)
            throw inputError(`${what} is larger than 64 MiB: ${displayPath}`);
        text = readFileSync(path, "utf8");
    }
    catch (error) {
        if (error instanceof Error && error.name === "ArchitectureCheckError")
            throw error;
        throw inputError(`Cannot read ${what}: ${displayPath}`);
    }
    try {
        return { raw: JSON.parse(text), text };
    }
    catch {
        throw inputError(`${what} is not valid JSON: ${displayPath}`);
    }
}
function obj(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function lineValue(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
/** Reads and validates an `impact-check graph --format json` file. */
export function readGraph(path, displayPath) {
    const { raw, text } = readJson(path, displayPath, "Module graph");
    const root = obj(raw);
    const bad = (why) => {
        throw inputError(`Module graph ${displayPath} is not an impact-check graph 1.0 file: ${why}`, "Create it with `impact-check graph --format json --output graph.json` (Impact Check ≥ 0.3.0).");
    };
    if (root === null)
        return bad("not a JSON object");
    if (root["schema_version"] !== "1.0")
        return bad(`schema_version is ${JSON.stringify(root["schema_version"])}`);
    if (!Array.isArray(root["modules"]) || !Array.isArray(root["edges"]))
        return bad("modules/edges missing");
    const modules = [];
    for (const m of root["modules"]) {
        const o = obj(m);
        if (o === null || typeof o["path"] !== "string" || typeof o["kind"] !== "string")
            return bad("invalid module");
        modules.push({ path: o["path"], kind: o["kind"] });
    }
    const edges = [];
    for (const e of root["edges"]) {
        const o = obj(e);
        if (o === null || typeof o["from"] !== "string" || typeof o["to"] !== "string")
            return bad("invalid edge");
        const imports = Array.isArray(o["imports"]) ? o["imports"] : [];
        const first = obj(imports[0]);
        edges.push({
            from: o["from"],
            to: o["to"],
            provenance: o["provenance"] === "graph" ? "graph" : "inferred",
            typeOnly: o["type_only"] === true,
            line: first ? lineValue(first["line"]) : null,
        });
    }
    const externalImports = [];
    for (const x of Array.isArray(root["external_imports"]) ? root["external_imports"] : []) {
        const o = obj(x);
        if (o === null || typeof o["from"] !== "string" || typeof o["specifier"] !== "string")
            return bad("invalid external import");
        externalImports.push({ from: o["from"], specifier: o["specifier"], line: lineValue(o["line"]) });
    }
    const repository = obj(root["repository"]);
    const workspacePackages = [];
    for (const p of Array.isArray(repository?.["workspace_packages"])
        ? repository["workspace_packages"]
        : []) {
        const o = obj(p);
        if (o !== null && typeof o["name"] === "string" && typeof o["path"] === "string")
            workspacePackages.push({ name: o["name"], path: o["path"] });
    }
    return {
        info: { path: displayPath, schema_version: "1.0", sha256: sha256(text) },
        modules,
        edges,
        externalImports,
        workspacePackages,
    };
}
/** Reads and validates an Impact Check JSON report (schema 2.0). */
export function readImpactReport(path, displayPath) {
    const { raw, text } = readJson(path, displayPath, "Impact Check report");
    const root = obj(raw);
    if (root === null || root["schema_version"] !== "2.0" || !Array.isArray(root["changed_files"]))
        throw inputError(`${displayPath} is not an Impact Check report with schema_version 2.0`, "Create it with `impact-check analyze --format json --output impact-check-report.json`.");
    const changedPaths = new Set();
    for (const f of root["changed_files"]) {
        const o = obj(f);
        if (o !== null && typeof o["path"] === "string" && o["status"] !== "deleted")
            changedPaths.add(o["path"]);
    }
    return { info: { path: displayPath, schema_version: "2.0", sha256: sha256(text) }, changedPaths };
}
