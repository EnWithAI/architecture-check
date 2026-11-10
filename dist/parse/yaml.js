// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Safe YAML/JSON parsing with line numbers (D-082): YAML 1.2 core schema, unique keys, at most 100 alias
 * expansions, no custom tags. Each document becomes a plain value plus a map from JSON pointer to 1-based line
 * (the key's line for mapping entries, the item's line for sequence items).
 */
import { isMap, isPair, isScalar, isSeq, LineCounter, parseAllDocuments } from "yaml";
/** JSON pointer segment escaping (RFC 6901). */
export function pointerSegment(key) {
    return key.replace(/~/g, "~0").replace(/\//g, "~1");
}
function collect(node, pointer, lc, lines) {
    if (node === null)
        return;
    if (isMap(node)) {
        for (const pair of node.items) {
            if (!isPair(pair))
                continue;
            const key = isScalar(pair.key) ? String(pair.key.value) : null;
            if (key === null)
                continue;
            const p = `${pointer}/${pointerSegment(key)}`;
            const keyNode = pair.key;
            if (keyNode.range)
                lines.set(p, lc.linePos(keyNode.range[0]).line);
            collect(pair.value, p, lc, lines);
        }
    }
    else if (isSeq(node)) {
        node.items.forEach((item, i) => {
            const p = `${pointer}/${i}`;
            const n = item;
            if (n && n.range)
                lines.set(p, lc.linePos(n.range[0]).line);
            collect(n, p, lc, lines);
        });
    }
}
/** Parses every document in a YAML (or JSON) text; null when any document has an error. */
export function parseYaml(text) {
    const lc = new LineCounter();
    try {
        const docs = parseAllDocuments(text, {
            lineCounter: lc,
            schema: "core",
            version: "1.2",
            uniqueKeys: true,
            prettyErrors: false,
            customTags: [],
        });
        if (!Array.isArray(docs))
            return null;
        const out = [];
        for (const doc of docs) {
            if (doc.errors.length > 0)
                return null;
            const lines = new Map();
            collect(doc.contents, "", lc, lines);
            out.push({ value: doc.toJS({ maxAliasCount: 100 }), lines });
        }
        return out;
    }
    catch {
        return null;
    }
}
/** Plain-object check for parsed YAML values. */
export function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Line for a pointer, falling back to its closest recorded ancestor, then 1. */
export function lineOf(doc, pointer) {
    let p = pointer;
    while (p !== "") {
        const line = doc.lines.get(p);
        if (line !== undefined)
            return line;
        p = p.slice(0, p.lastIndexOf("/"));
    }
    return 1;
}
