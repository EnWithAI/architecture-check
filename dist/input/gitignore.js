// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * `.gitignore` matching (docs/SPEC.md §3.1, D-103), in process: git is never run. Supports comments, escapes,
 * negation, directory-only and anchored patterns, `*`, `?`, `[...]` and `**`, with the last matching rule winning.
 * As in git, a path under an ignored directory cannot be re-included (the walk never enters that directory).
 */
/** Converts one gitignore glob to a RegExp source (no anchors). Unclosed `[` is literal. */
function globSource(glob) {
    let out = "";
    for (let i = 0; i < glob.length; i++) {
        const ch = glob[i];
        if (ch === "\\" && i + 1 < glob.length) {
            out += glob[++i].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
        }
        else if (ch === "*") {
            if (glob[i + 1] === "*") {
                const atStart = i === 0 || glob[i - 1] === "/";
                const atEnd = i + 2 === glob.length;
                if (atStart && glob[i + 2] === "/") {
                    out += "(?:.*/)?";
                    i += 2;
                    continue;
                }
                if (atStart && atEnd) {
                    out += ".*";
                    i += 1;
                    continue;
                }
                i += 1;
            }
            out += "[^/]*";
        }
        else if (ch === "?") {
            out += "[^/]";
        }
        else if (ch === "[") {
            const close = glob.indexOf("]", i + 2);
            if (close === -1) {
                out += "\\[";
                continue;
            }
            let body = glob.slice(i + 1, close);
            const negated = body.startsWith("!") || body.startsWith("^");
            if (negated)
                body = body.slice(1);
            out += `[${negated ? "^" : ""}${body.replace(/[\\\]^]/g, "\\$&")}]`;
            i = close;
        }
        else {
            out += ch.replace(/[.+^${}()|\\/]/g, "\\$&");
        }
    }
    return out;
}
/** Parses the text of a `.gitignore` file located in repository directory `base`. */
export function parseGitignore(text, base) {
    const rules = [];
    for (const raw of text.split("\n")) {
        let line = raw.replace(/\r$/, "");
        if (line === "" || line.startsWith("#"))
            continue;
        while (line.endsWith(" ") && !line.endsWith("\\ "))
            line = line.slice(0, -1);
        let negate = false;
        if (line.startsWith("!")) {
            negate = true;
            line = line.slice(1);
        }
        else if (line.startsWith("\\!") || line.startsWith("\\#")) {
            line = line.slice(1);
        }
        const dirOnly = line.endsWith("/");
        if (dirOnly)
            line = line.replace(/\/+$/, "");
        const anchored = line.includes("/");
        line = line.replace(/^\//, "");
        if (line === "")
            continue;
        const source = globSource(line);
        rules.push({
            base,
            negate,
            dirOnly,
            regex: new RegExp(anchored ? `^${source}$` : `^(?:.*/)?${source}$`),
        });
    }
    return rules;
}
/** True when the last rule matching `rel` (repository-relative) ignores it. Rules are in precedence order. */
export function isGitignored(rel, isDir, rules) {
    let ignored = false;
    for (const rule of rules) {
        if (rule.dirOnly && !isDir)
            continue;
        let sub;
        if (rule.base === ".")
            sub = rel;
        else if (rel.startsWith(`${rule.base}/`))
            sub = rel.slice(rule.base.length + 1);
        else
            continue;
        if (rule.regex.test(sub))
            ignored = !rule.negate;
    }
    return ignored;
}
