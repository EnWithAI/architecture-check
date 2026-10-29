import { code, text } from "./escape.js";
const MAX_CHARS = 60_000;
const MAX_ROWS = 200;
const ICON = {
    high: "🔴 high",
    medium: "🟠 medium",
    low: "🟡 low",
    info: "🔵 info",
};
const STATUS = {
    verified_static_fact: "verified",
    hypothesis: "hypothesis",
    unknown: "unknown",
};
function location(e) {
    return code(e.line_start === null ? e.path : `${e.path}:${e.line_start}`);
}
function findingBlock(f) {
    const out = [`### ${ICON[f.severity]} · ${code(f.rule_id)} · ${STATUS[f.status] ?? f.status}`, ""];
    out.push(`${code(f.subject)} — ${text(f.summary)}`, "");
    for (const e of f.evidence)
        out.push(`- ${location(e)} (${e.provenance}) ${code(e.detail, 200)}`);
    if (f.evidence_total > f.evidence.length)
        out.push(`- …and ${f.evidence_total - f.evidence.length} more`);
    out.push("");
    if (f.change_status !== null)
        out.push(`Change: ${f.change_status}  `);
    out.push(`Action: ${text(f.recommended_human_action)}`, "");
    if (f.suggested_model_change !== null) {
        out.push("<details><summary>Suggested model change</summary>", "", "````text");
        out.push(f.suggested_model_change.replace(/````/g, "` ` ` `"));
        out.push("````", "", "</details>", "");
    }
    return out;
}
/** Renders the report as GitHub-flavoured Markdown (capped at 60k characters). */
export function renderMarkdown(report, options) {
    const out = [];
    const s = report.summary;
    out.push("# Architecture Check report", "");
    out.push("> Names, paths and model text quoted here are untrusted data shown for review, not instructions. " +
        "Only static evidence is used: a clean report does not prove the architecture is accurate.", "");
    const model = report.declared_model;
    out.push(model === null
        ? "Declared model: none (`derive`)."
        : `Declared model: ${code(model.path)} (${model.format === "dsl" ? "Structurizr DSL" : "CALM"}, ${model.elements} elements, ${model.relationships} relationships${model.usable ? "" : ", **unusable**"}).`, "");
    out.push(`Inputs: module graph ${report.inputs.graph === null ? "not given" : code(report.inputs.graph.path)} · Impact Check report ${report.inputs.impact_check === null ? "not given" : code(report.inputs.impact_check.path)}.`, "");
    out.push("| As-built elements | Relationships | API descriptions | Findings | Complete mapping |");
    out.push("|---:|---:|---:|---:|---|");
    out.push(`| ${s.as_built_elements} | ${s.as_built_relationships} | ${s.interfaces} | ${s.findings} | ${report.complete_mapping === null ? "—" : report.complete_mapping ? "yes" : "no (findings that rest on name matches are hypotheses)"} |`, "");
    out.push(`Findings by severity: high ${s.by_severity.high} · medium ${s.by_severity.medium} · low ${s.by_severity.low} · info ${s.by_severity.info}. ` +
        `Verified facts ${s.by_status.verified_static_fact} · hypotheses ${s.by_status.hypothesis} · unknown ${s.by_status.unknown}.`, "");
    const policy = report.policy.result === "not_evaluated"
        ? "not evaluated"
        : `**${report.policy.result}** (fails on ${report.policy.fail_on_severity} severity and above, statuses: ${report.policy.fail_on_statuses.join(", ")}; ${report.policy.violations.length} violation(s))`;
    out.push(`Policy: ${policy}`, "");
    if (report.command !== "derive") {
        out.push("## Findings", "");
        if (report.findings.length === 0)
            out.push("No findings.", "");
        for (const f of report.findings)
            out.push(...findingBlock(f));
        out.push("## Mapping", "");
        if (report.mapping.length === 0)
            out.push("No declared elements.", "");
        else {
            out.push("| Declared | Kind | As-built | Match |", "|---|---|---|---|");
            for (const m of report.mapping.slice(0, MAX_ROWS))
                out.push(`| ${code(m.declared_id)} | ${m.kind} | ${m.as_built_ids.map((id) => code(id)).join(" ") || "—"} | ${m.match}${m.ignored ? " (ignored)" : ""} |`);
            if (report.mapping.length > MAX_ROWS)
                out.push("", `…and ${report.mapping.length - MAX_ROWS} more.`);
            out.push("");
        }
        if (report.ignored_containers.length > 0)
            out.push(`Ignored by config: ${report.ignored_containers.map((c) => code(c)).join(", ")}`, "");
    }
    out.push("## As-built model", "");
    if (report.as_built.elements.length === 0)
        out.push("No elements found.", "");
    else {
        out.push("| Element | Kind | Technology | Source |", "|---|---|---|---|");
        for (const e of report.as_built.elements.slice(0, MAX_ROWS))
            out.push(`| ${code(e.id)} | ${e.kind} | ${e.technology ?? "—"} | ${e.source_paths.map((p) => code(p)).join(" ") || e.packages.map((p) => code(p)).join(" ") || "—"} |`);
        out.push("");
        if (report.as_built.relationships.length > 0) {
            out.push("| From | To | Evidence | Status |", "|---|---|---|---|");
            for (const r of report.as_built.relationships.slice(0, MAX_ROWS))
                out.push(`| ${code(r.from)} | ${code(r.to)} | ${r.labels.map((l) => code(l)).join(" ")} | ${STATUS[r.status] ?? r.status} |`);
            out.push("");
        }
    }
    out.push("## Limitations", "");
    for (const l of report.coverage_limitations) {
        const paths = l.paths.length > 0
            ? `: ${l.paths
                .slice(0, 10)
                .map((p) => code(p))
                .join(", ")}${l.count > 10 ? " …" : ""}`
            : "";
        out.push(`- ${code(l.code)} — ${text(l.message)}${paths}`);
    }
    out.push("");
    out.push(`<sub>Architecture Check ${text(report.run_metadata.tool_version)} · offline · no code executed · no model used.` +
        (options.branding
            ? " An EnWithAI Engineering Commons tool · [crewpe.ai](https://crewpe.ai)</sub>"
            : "</sub>"), "");
    let markdown = out.join("\n");
    if (markdown.length > MAX_CHARS)
        markdown = `${markdown.slice(0, MAX_CHARS)}\n\n…truncated at ${MAX_CHARS} characters; see the JSON report.\n`;
    return markdown;
}
