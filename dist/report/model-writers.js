import { redact } from "./redact.js";
/** Description of the generated system. */
export const SYSTEM_DESCRIPTION = "Derived by Architecture Check from static evidence. Review before adopting it as the declared model.";
/** DSL string literal: control characters removed, backslashes and quotes escaped, secrets masked. */
export function dslString(value) {
    const clean = redact(value)
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
    return `"${clean}"`;
}
/** Container description: descriptor files, or the origin when there are none. */
export function elementDescription(el) {
    if (el.kind === "external_system")
        return `npm: ${el.packages.join(", ")}`;
    if (el.kind === "component")
        return "";
    if (el.descriptors.length > 0)
        return el.descriptors.join(", ");
    if (el.origins.includes("workspace-package"))
        return "Workspace package";
    if (el.origins.includes("root-package"))
        return "Root package";
    return "Declared source";
}
/** The value written as `commons.source`. */
export function elementSource(el) {
    if (el.kind === "external_system")
        return el.packages.join(", ");
    return el.source_paths[0] ?? el.name;
}
/** Local identifier of an element inside its parent (`api.orders` → `orders`). */
function localId(el) {
    return el.kind === "component" ? el.id.split(".").at(-1) : el.id;
}
/** Renders the as-built model as a Structurizr DSL workspace. */
export function renderDsl(report) {
    const { elements, relationships, system_name } = report.as_built;
    const containers = elements.filter((e) => e.kind === "container");
    const externals = elements.filter((e) => e.kind === "external_system");
    const ref = (id) => {
        const el = elements.find((e) => e.id === id);
        if (el.kind === "external_system")
            return el.id;
        if (el.kind === "component")
            return `system.${el.parent}.${localId(el)}`;
        return `system.${el.id}`;
    };
    const block = (el, indent) => {
        const keyword = el.kind === "component" ? "component" : "container";
        const lines = [
            `${indent}${localId(el)} = ${keyword} ${dslString(el.name)} ${dslString(elementDescription(el))} ${dslString(el.technology ?? "")} {`,
            `${indent}    properties {`,
            `${indent}        "commons.source" ${dslString(elementSource(el))}`,
            `${indent}    }`,
        ];
        for (const child of elements.filter((e) => e.kind === "component" && e.parent === el.id))
            lines.push(...block(child, `${indent}    `));
        lines.push(`${indent}}`);
        return lines;
    };
    const out = [
        `workspace ${dslString(system_name)} ${dslString(SYSTEM_DESCRIPTION)} {`,
        "    !identifiers hierarchical",
        "",
        "    model {",
        `        system = softwareSystem ${dslString(system_name)} {`,
    ];
    for (const c of containers)
        out.push(...block(c, "            "));
    out.push("        }");
    for (const x of externals)
        out.push(`        ${x.id} = softwareSystem ${dslString(x.name)} ${dslString(elementDescription(x))} "External" {`, "            properties {", `                "commons.source" ${dslString(elementSource(x))}`, "            }", "        }");
    if (relationships.length > 0)
        out.push("");
    for (const r of relationships)
        out.push(`        ${ref(r.from)} -> ${ref(r.to)} ${dslString(r.labels.join(", "))}`);
    out.push("    }", "", "    views {", "        systemContext system {", "            include *", "            autolayout lr", "        }", "        container system {", "            include *", "            autolayout lr", "        }", "    }", "}", "");
    return out.join("\n");
}
const NODE_TYPE = {
    service: "service",
    database: "database",
    component: "component",
    ecosystem: "ecosystem",
};
/** Renders the as-built model as a CALM 1.3 architecture document. */
export function renderCalm(report) {
    const { elements, relationships, system_name } = report.as_built;
    const node = (id, type, name, description, metadata) => ({
        "unique-id": id,
        "node-type": type,
        name: redact(name),
        description: redact(description),
        ...(metadata ? { metadata } : {}),
    });
    const nodes = [
        ...elements.map((el) => node(el.id, NODE_TYPE[el.node_type], el.name, elementDescription(el), {
            ...(el.technology !== null ? { technology: el.technology } : {}),
            "commons.source": redact(elementSource(el)),
        })),
        node("system", "system", system_name, SYSTEM_DESCRIPTION),
    ].sort((a, b) => (a["unique-id"] < b["unique-id"] ? -1 : a["unique-id"] > b["unique-id"] ? 1 : 0));
    const parents = new Map();
    for (const el of elements) {
        if (el.kind === "external_system")
            continue;
        const parent = el.parent ?? "system";
        parents.set(parent, [...(parents.get(parent) ?? []), el.id]);
    }
    const composed = [...parents.keys()].sort().map((parent) => ({
        "unique-id": `${parent}-composed-of`,
        "relationship-type": { "composed-of": { container: parent, nodes: parents.get(parent) } },
    }));
    const connects = relationships.map((r) => ({
        "unique-id": `${r.from}-connects-${r.to}`,
        description: r.labels.join(", "),
        "relationship-type": { connects: { source: { node: r.from }, destination: { node: r.to } } },
    }));
    const doc = {
        $schema: "https://calm.finos.org/release/1.3/meta/calm.json",
        metadata: { "commons.generated-by": "architecture-check" },
        nodes,
        relationships: [...composed, ...connects],
    };
    return `${JSON.stringify(doc, null, 2)}\n`;
}
