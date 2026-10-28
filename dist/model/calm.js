import { propertyList, propertyTrue, } from "./types.js";
function obj(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
/** Merges CALM metadata (an object, or an array of objects merged in order). */
function metadataOf(value) {
    const single = obj(value);
    if (single !== null)
        return single;
    const merged = {};
    if (Array.isArray(value))
        for (const item of value)
            Object.assign(merged, obj(item) ?? {});
    return merged;
}
/** Line of the first `"unique-id": "<id>"` in the text, or 1. */
function lineOfId(text, id) {
    const needle = JSON.stringify(id);
    const re = /"unique-id"\s*:\s*/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (text.startsWith(needle, m.index + m[0].length))
            return text.slice(0, m.index).split("\n").length;
    }
    return 1;
}
function kindOf(nodeType, metadata) {
    if (nodeType === "actor")
        return "person";
    if (nodeType === "ecosystem")
        return "external_system";
    if (nodeType === "system")
        return propertyTrue(metadata["commons.external"]) ? "external_system" : "software_system";
    if (nodeType === "component")
        return "component";
    return "container";
}
/** Reads a CALM architecture document into the declared IR. */
export function readCalm(text, modelPath, limitations) {
    const issues = [];
    const model = {
        format: "calm",
        schema: null,
        usable: true,
        elements: [],
        relationships: [],
        issues,
        pathReferences: [],
    };
    let raw;
    try {
        raw = JSON.parse(text);
    }
    catch {
        issues.push({ rule: "model-invalid", subject: "json", line: 1, detail: "not valid JSON" });
        model.usable = false;
        return model;
    }
    const root = obj(raw);
    if (root === null || !Array.isArray(root["nodes"])) {
        issues.push({ rule: "model-invalid", subject: "structure", line: 1, detail: "no nodes array" });
        model.usable = false;
        return model;
    }
    if (typeof root["$schema"] === "string")
        model.schema = root["$schema"];
    if (root["flows"] !== undefined || root["controls"] !== undefined)
        limitations.add("calm-unsupported", modelPath);
    const byId = new Map();
    for (const n of root["nodes"]) {
        const node = obj(n);
        const id = node?.["unique-id"];
        if (node === null || typeof id !== "string" || id === "") {
            issues.push({
                rule: "model-reference-invalid",
                subject: "node",
                line: 1,
                detail: "node without unique-id",
            });
            continue;
        }
        const line = lineOfId(text, id);
        if (byId.has(id)) {
            issues.push({ rule: "model-reference-invalid", subject: id, line, detail: "duplicate unique-id" });
            continue;
        }
        if (node["interfaces"] !== undefined || node["controls"] !== undefined)
            limitations.add("calm-unsupported", modelPath);
        const metadata = metadataOf(node["metadata"]);
        const element = {
            id,
            kind: kindOf(node["node-type"], metadata),
            name: typeof node["name"] === "string" ? node["name"] : id,
            technology: typeof metadata["technology"] === "string" ? metadata["technology"] : null,
            parent: null,
            line,
            sources: propertyList(metadata["commons.source"]),
            allowedDependencies: metadata["commons.allowed-dependencies"] === undefined
                ? null
                : propertyList(metadata["commons.allowed-dependencies"]),
            ignore: propertyTrue(metadata["commons.ignore"]),
        };
        byId.set(id, element);
    }
    const undefinedRef = (ref, line, detail) => {
        issues.push({ rule: "model-reference-invalid", subject: String(ref), line, detail });
    };
    for (const r of Array.isArray(root["relationships"]) ? root["relationships"] : []) {
        const rel = obj(r);
        const relId = typeof rel?.["unique-id"] === "string" ? rel["unique-id"] : "";
        const line = relId === "" ? 1 : lineOfId(text, relId);
        const type = obj(rel?.["relationship-type"]);
        if (rel === null || type === null) {
            undefinedRef(relId || "relationship", line, "relationship without relationship-type");
            continue;
        }
        const description = typeof rel["description"] === "string" ? rel["description"] : "";
        const connects = obj(type["connects"]);
        const interacts = obj(type["interacts"]);
        const containment = obj(type["composed-of"]) ?? obj(type["deployed-in"]);
        if (connects !== null) {
            const from = obj(connects["source"])?.["node"];
            const to = obj(connects["destination"])?.["node"];
            if (typeof from !== "string" || !byId.has(from))
                undefinedRef(from, line, "connects source is not defined");
            else if (typeof to !== "string" || !byId.has(to))
                undefinedRef(to, line, "connects destination is not defined");
            else
                model.relationships.push({ from, to, line, description });
        }
        else if (interacts !== null) {
            const actor = interacts["actor"];
            if (typeof actor !== "string" || !byId.has(actor)) {
                undefinedRef(actor, line, "interacts actor is not defined");
                continue;
            }
            for (const to of Array.isArray(interacts["nodes"]) ? interacts["nodes"] : []) {
                if (typeof to !== "string" || !byId.has(to))
                    undefinedRef(to, line, "interacts node is not defined");
                else
                    model.relationships.push({ from: actor, to, line, description });
            }
        }
        else if (containment !== null) {
            const container = containment["container"];
            const parent = typeof container === "string" ? byId.get(container) : undefined;
            if (parent === undefined) {
                undefinedRef(container, line, "containment container is not defined");
                continue;
            }
            for (const child of Array.isArray(containment["nodes"]) ? containment["nodes"] : []) {
                const el = typeof child === "string" ? byId.get(child) : undefined;
                if (el === undefined) {
                    undefinedRef(child, line, "contained node is not defined");
                    continue;
                }
                const fits = ((el.kind === "container" || el.kind === "external_system") && parent.kind === "software_system") ||
                    (el.kind === "component" && parent.kind === "container");
                if (fits && el.parent === null)
                    el.parent = parent.id;
            }
        }
        else
            limitations.add("calm-unsupported", modelPath);
    }
    for (const el of byId.values())
        for (const dep of el.allowedDependencies ?? [])
            if (!byId.has(dep))
                issues.push({
                    rule: "model-reference-invalid",
                    subject: dep,
                    line: el.line,
                    detail: `commons.allowed-dependencies of ${el.id} names an undefined element`,
                });
    const adrs = Array.isArray(root["adrs"]) ? root["adrs"] : [];
    for (const adr of adrs) {
        if (typeof adr !== "string" || adr.trim() === "" || /^[a-z][a-z0-9+.-]*:/i.test(adr))
            continue;
        const at = text.indexOf(JSON.stringify(adr));
        model.pathReferences.push({ path: adr, line: at < 0 ? 1 : text.slice(0, at).split("\n").length });
    }
    model.elements = [...byId.values()];
    return model;
}
