import { propertyList, propertyTrue, } from "./types.js";
/** Splits DSL text into per-line token lists; null when a string or block comment is unterminated. */
export function tokenize(text) {
    const statements = [];
    const lines = text.split(/\r?\n/);
    let inBlockComment = false;
    for (let n = 0; n < lines.length; n++) {
        const line = lines[n];
        const tokens = [];
        let i = 0;
        while (i < line.length) {
            if (inBlockComment) {
                const end = line.indexOf("*/", i);
                if (end < 0)
                    break;
                inBlockComment = false;
                i = end + 2;
                continue;
            }
            const ch = line[i];
            if (ch === " " || ch === "\t") {
                i++;
                continue;
            }
            if (ch === "/" && line[i + 1] === "*") {
                inBlockComment = true;
                i += 2;
                continue;
            }
            if ((ch === "/" && line[i + 1] === "/") || (ch === "#" && tokens.length === 0))
                break;
            if (ch === "{" || ch === "}" || ch === "=") {
                tokens.push({ text: ch, quoted: false });
                i++;
                continue;
            }
            if (ch === "-" && line[i + 1] === ">") {
                tokens.push({ text: "->", quoted: false });
                i += 2;
                continue;
            }
            if (ch === '"') {
                let value = "";
                let j = i + 1;
                let closed = false;
                while (j < line.length) {
                    const c = line[j];
                    if (c === "\\" && j + 1 < line.length) {
                        value += line[j + 1];
                        j += 2;
                        continue;
                    }
                    if (c === '"') {
                        closed = true;
                        break;
                    }
                    value += c;
                    j++;
                }
                if (!closed)
                    return null;
                tokens.push({ text: value, quoted: true });
                i = j + 1;
                continue;
            }
            let j = i;
            while (j < line.length && !/[\s{}="]/.test(line[j]) && !line.startsWith("->", j))
                j++;
            tokens.push({ text: line.slice(i, j), quoted: false });
            i = j;
        }
        if (tokens.length > 0)
            statements.push({ line: n + 1, tokens });
    }
    return inBlockComment ? null : statements;
}
const SKIPPED_SILENTLY = new Set([
    "views",
    "styles",
    "configuration",
    "branding",
    "terminology",
    "perspectives",
]);
const ELEMENT_KEYWORDS = {
    person: "person",
    softwaresystem: "software_system",
    container: "container",
    component: "component",
};
const UNSAFE = new Set(["!script", "!plugin"]);
/** Reads a Structurizr DSL workspace into the declared IR. */
export function readDsl(text, modelPath, limitations) {
    const issues = [];
    const model = {
        format: "dsl",
        schema: null,
        usable: true,
        elements: [],
        relationships: [],
        issues,
        pathReferences: [],
    };
    const statements = tokenize(text);
    if (statements === null) {
        issues.push({
            rule: "model-invalid",
            subject: "syntax",
            line: 1,
            detail: "unterminated string or block comment",
        });
        model.usable = false;
        return model;
    }
    const raw = [];
    const pending = [];
    const stack = [];
    let hierarchical = false;
    let sawWorkspace = false;
    let sawModel = false;
    let anonymous = 0;
    const elementScope = () => stack.filter((c) => c.type === "element").map((c) => c.id);
    const currentElement = () => elementScope().at(-1) ?? null;
    const unsafe = (subject, line, detail) => {
        issues.push({ rule: "model-invalid", subject, line, detail });
    };
    /** Handles `!directive` statements; returns true when handled. */
    const directive = (st) => {
        const name = st.tokens[0].text.toLowerCase();
        const arg = st.tokens[1]?.text ?? "";
        const opensBlock = st.tokens.at(-1)?.text === "{";
        if (UNSAFE.has(name)) {
            unsafe(name, st.line, `${name} is never evaluated`);
            if (opensBlock)
                stack.push({ type: "skip", depth: 1 });
            return;
        }
        if (name === "!include") {
            if (/^[a-z][a-z0-9+.-]*:\/\//i.test(arg))
                unsafe("!include", st.line, "remote !include is never fetched");
            else
                limitations.add("dsl-include-not-followed", `${modelPath}:${st.line}`);
            return;
        }
        if (name === "!identifiers") {
            hierarchical = arg.toLowerCase() === "hierarchical";
            return;
        }
        if (name === "!docs" || name === "!adrs") {
            if (arg !== "" && !/^[a-z][a-z0-9+.-]*:\/\//i.test(arg))
                model.pathReferences.push({ path: arg, line: st.line });
            if (opensBlock)
                stack.push({ type: "skip", depth: 1 });
            return;
        }
        if (name !== "!impliedrelationships")
            limitations.add("dsl-statement-ignored", `${modelPath}:${st.line}`);
        if (opensBlock)
            stack.push({ type: "skip", depth: 1 });
    };
    for (const st of statements) {
        const top = stack.at(-1);
        const tokens = st.tokens;
        const first = tokens[0];
        const opensBlock = tokens.at(-1)?.text === "{" && !tokens.at(-1)?.quoted;
        if (top?.type === "skip") {
            for (const t of tokens) {
                if (t.quoted)
                    continue;
                if (t.text === "{")
                    top.depth++;
                else if (t.text === "}")
                    top.depth--;
            }
            if (top.depth <= 0)
                stack.pop();
            continue;
        }
        if (first.text === "}" && !first.quoted) {
            if (stack.length === 0) {
                issues.push({ rule: "model-invalid", subject: "syntax", line: st.line, detail: "unbalanced braces" });
                model.usable = false;
                return model;
            }
            stack.pop();
            continue;
        }
        if (top === undefined) {
            if (first.text.toLowerCase() === "workspace") {
                sawWorkspace = true;
                if (tokens[1]?.text.toLowerCase() === "extends" && !tokens[1].quoted)
                    unsafe("workspace extends", st.line, "workspace extends is never loaded");
                if (opensBlock)
                    stack.push({ type: "workspace" });
            }
            else if (first.text.startsWith("!"))
                directive(st);
            else
                limitations.add("dsl-statement-ignored", `${modelPath}:${st.line}`);
            continue;
        }
        if (top.type === "properties") {
            if (tokens.length >= 2 && top.id !== null) {
                const el = raw.find((e) => e.id === top.id);
                if (el)
                    el.properties[first.text] = tokens[1].text;
            }
            if (opensBlock)
                stack.push({ type: "skip", depth: 1 });
            continue;
        }
        if (first.text.startsWith("!") && !first.quoted) {
            directive(st);
            continue;
        }
        const keyword = first.quoted ? "" : first.text.toLowerCase();
        if (top.type === "workspace") {
            if (keyword === "model" && opensBlock) {
                sawModel = true;
                stack.push({ type: "model" });
            }
            else if (SKIPPED_SILENTLY.has(keyword) && opensBlock)
                stack.push({ type: "skip", depth: 1 });
            else if (keyword === "properties" && opensBlock)
                stack.push({ type: "properties", id: null });
            else if (keyword === "name" || keyword === "description")
                continue;
            else {
                limitations.add("dsl-statement-ignored", `${modelPath}:${st.line}`);
                if (opensBlock)
                    stack.push({ type: "skip", depth: 1 });
            }
            continue;
        }
        // model, group or element context
        const current = currentElement();
        if (keyword === "group" || keyword === "enterprise") {
            if (opensBlock)
                stack.push({ type: "group" });
            continue;
        }
        if (keyword === "deploymentenvironment") {
            limitations.add("dsl-deployment-ignored", `${modelPath}:${st.line}`);
            if (opensBlock)
                stack.push({ type: "skip", depth: 1 });
            continue;
        }
        if (keyword === "properties" && opensBlock) {
            stack.push({ type: "properties", id: current });
            continue;
        }
        if (SKIPPED_SILENTLY.has(keyword) && opensBlock) {
            stack.push({ type: "skip", depth: 1 });
            continue;
        }
        if ((keyword === "technology" || keyword === "description" || keyword === "tags" || keyword === "url") &&
            current) {
            const el = raw.find((e) => e.id === current);
            if (el && keyword === "technology")
                el.technology = tokens[1]?.text ?? null;
            if (el && keyword === "tags")
                el.tags.push(...tokens.slice(1).flatMap((t) => propertyList(t.text)));
            continue;
        }
        // optional `identifier =` prefix
        let rest = tokens;
        let ident = null;
        if (tokens.length >= 3 && tokens[1]?.text === "=" && !tokens[1].quoted && !first.quoted) {
            ident = first.text;
            rest = tokens.slice(2);
        }
        const arrow = rest.findIndex((t) => t.text === "->" && !t.quoted);
        if (arrow >= 0) {
            const src = arrow === 0 ? "this" : rest[0].text;
            const dst = rest[arrow + 1]?.text;
            if (dst === undefined) {
                limitations.add("dsl-statement-ignored", `${modelPath}:${st.line}`);
                continue;
            }
            const from = src === "this" ? current : src;
            if (from === null) {
                issues.push({
                    rule: "model-reference-invalid",
                    subject: "this",
                    line: st.line,
                    detail: "no enclosing element",
                });
                continue;
            }
            const args = rest.slice(arrow + 2).filter((t) => t.text !== "{");
            pending.push({
                from: src === "this" ? `\u0000${from}` : from,
                to: dst,
                scope: elementScope(),
                line: st.line,
                description: args[0]?.text ?? "",
            });
            if (opensBlock)
                stack.push({ type: "skip", depth: 1 });
            continue;
        }
        const kw = rest[0].quoted ? "" : rest[0].text.toLowerCase();
        const kind = ELEMENT_KEYWORDS[kw];
        if (kind === undefined) {
            limitations.add("dsl-statement-ignored", `${modelPath}:${st.line}`);
            if (opensBlock)
                stack.push({ type: "skip", depth: 1 });
            continue;
        }
        const args = rest.slice(1).filter((t) => !(t.text === "{" && !t.quoted));
        const local = ident ?? `~anonymous${++anonymous}`;
        const scope = elementScope();
        const id = hierarchical && ident !== null && scope.length > 0 ? `${scope.at(-1)}.${local}` : local;
        if (raw.some((e) => e.id === id))
            issues.push({
                rule: "model-reference-invalid",
                subject: id,
                line: st.line,
                detail: "duplicate identifier",
            });
        const hasTechnology = kind === "container" || kind === "component";
        raw.push({
            id,
            kind,
            name: args[0]?.text ?? local,
            technology: hasTechnology ? args[2]?.text || null : null,
            parent: current,
            line: st.line,
            tags: propertyList(args[hasTechnology ? 3 : 2]?.text ?? ""),
            properties: {},
        });
        if (opensBlock)
            stack.push({ type: "element", id });
    }
    if (stack.length > 0 || !sawWorkspace || !sawModel) {
        issues.push({
            rule: "model-invalid",
            subject: "syntax",
            line: statements.at(-1)?.line ?? 1,
            detail: stack.length > 0 ? "unbalanced braces" : "no workspace/model block",
        });
        model.usable = false;
        return model;
    }
    const ids = new Set(raw.map((e) => e.id));
    for (const e of raw) {
        const external = e.kind === "software_system" &&
            (e.tags.some((t) => t.toLowerCase() === "external") || propertyTrue(e.properties["commons.external"]));
        const kind = external ? "external_system" : e.kind;
        const element = {
            id: e.id,
            kind,
            name: e.name,
            technology: e.technology,
            parent: e.parent,
            line: e.line,
            sources: propertyList(e.properties["commons.source"]),
            allowedDependencies: e.properties["commons.allowed-dependencies"] === undefined
                ? null
                : propertyList(e.properties["commons.allowed-dependencies"]),
            ignore: propertyTrue(e.properties["commons.ignore"]),
        };
        for (const dep of element.allowedDependencies ?? [])
            if (!ids.has(dep))
                issues.push({
                    rule: "model-reference-invalid",
                    subject: dep,
                    line: e.line,
                    detail: `commons.allowed-dependencies of ${e.id} names an undefined element`,
                });
        model.elements.push(element);
    }
    const resolve = (ref, scope) => {
        if (ref.startsWith("\u0000"))
            return ref.slice(1);
        if (ids.has(ref))
            return ref;
        for (let i = scope.length - 1; i >= 0; i--) {
            const candidate = `${scope[i]}.${ref}`;
            if (ids.has(candidate))
                return candidate;
            const parent = scope[i].split(".").slice(0, -1).join(".");
            if (parent !== "" && ids.has(`${parent}.${ref}`))
                return `${parent}.${ref}`;
        }
        return null;
    };
    for (const p of pending) {
        const from = resolve(p.from, p.scope);
        const to = resolve(p.to, p.scope);
        if (from === null || to === null) {
            issues.push({
                rule: "model-reference-invalid",
                subject: from === null ? p.from : p.to,
                line: p.line,
                detail: "relationship endpoint is not defined",
            });
            continue;
        }
        const rel = { from, to, line: p.line, description: p.description };
        model.relationships.push(rel);
    }
    return model;
}
