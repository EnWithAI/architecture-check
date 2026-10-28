// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Declared ↔ as-built comparison (docs/SPEC.md §4–5): maps declared elements to as-built ones, lifts as-built
 * relationships to declared elements, and evaluates every drift rule. Findings carry their full evidence here; the
 * analyzer caps evidence lists for the report.
 */
import { posix } from "node:path";
import type { Config } from "../config.js";
import { sortEvidence, type AsBuilt } from "../derive/asbuilt.js";
import { familiesOfText } from "../derive/technology.js";
import { packageMatches } from "../derive/vendors.js";
import { exists, isDirectory } from "../input/walk.js";
import type { DeclaredElement, DeclaredModel } from "../model/types.js";
import type { AsBuiltElement, Evidence, Finding, MappingEntry, Severity, Status } from "../types.js";
import {
  compareStrings,
  contains,
  dirOf,
  normalizeName,
  normalizeRelative,
  sha256,
  slug,
} from "../util/paths.js";
import { dslString } from "../report/model-writers.js";
import { RULES } from "./rules.js";

/** Inputs of the comparison. */
export interface CompareInput {
  root: string;
  model: DeclaredModel;
  modelPath: string;
  modelRepoPath: string | null;
  asBuilt: AsBuilt;
  config: Config;
  graphPresent: boolean;
}

/** Result of the comparison. */
export interface CompareResult {
  mapping: MappingEntry[];
  completeMapping: boolean;
  ignoredContainers: string[];
  findings: Finding[];
}

/**
 * Declared container source values that are existing directories (become `declared-source` containers; `.` is the
 * repository root, D-100).
 */
export function declaredSourceDirectories(root: string, model: DeclaredModel): string[] {
  const out: string[] = [];
  for (const el of model.elements) {
    if (el.kind !== "container") continue;
    for (const value of el.sources) {
      const path = normalizeRelative(value);
      if (path !== null && isDirectory(root, path)) out.push(path);
    }
  }
  return out;
}

const CONFIDENCE: Record<Status, Finding["confidence"]> = {
  verified_static_fact: "high",
  hypothesis: "medium",
  unknown: "low",
};

/** Creates a finding with a deterministic id (rule id + subject, no line numbers). */
export function makeFinding(
  ruleId: string,
  subject: string,
  options: {
    summary: string;
    evidence: Evidence[];
    status?: Status;
    severity?: Severity;
    declared?: string[];
    asBuilt?: string[];
    suggested?: string | null;
  }
): Finding {
  const rule = RULES[ruleId];
  if (rule === undefined) throw new Error(`Unknown rule ${ruleId}`);
  const status = options.status ?? rule.status;
  const evidence = sortEvidence(options.evidence);
  return {
    id: `ACF-${sha256(`${ruleId}\u0000${subject}`).slice(0, 10).toUpperCase()}`,
    rule_id: ruleId,
    category: rule.category,
    severity: options.severity ?? rule.severity,
    status,
    confidence: CONFIDENCE[status],
    is_heuristic: status === "hypothesis",
    subject,
    summary: options.summary,
    declared_elements: [...(options.declared ?? [])].sort(compareStrings),
    as_built_elements: [...(options.asBuilt ?? [])].sort(compareStrings),
    evidence,
    evidence_total: evidence.length,
    recommended_human_action: rule.action,
    suggested_model_change: options.suggested ?? null,
    change_status: null,
  };
}

/** Suggested model snippet for an undeclared container or component. */
function suggestion(format: "dsl" | "calm", el: AsBuiltElement): string {
  const source = el.source_paths[0] ?? el.name;
  const id = slug(el.name);
  if (format === "calm")
    return JSON.stringify(
      {
        "unique-id": id,
        "node-type": el.kind === "component" ? "component" : el.node_type,
        name: el.name,
        description: "",
        metadata: { ...(el.technology ? { technology: el.technology } : {}), "commons.source": source },
      },
      null,
      2
    );
  const keyword = el.kind === "component" ? "component" : "container";
  return [
    `${id} = ${keyword} ${dslString(el.name)} "" ${dslString(el.technology ?? "")} {`,
    "    properties {",
    `        "commons.source" ${dslString(source)}`,
    "    }",
    "}",
  ].join("\n");
}

/** Maps, lifts and evaluates every rule. */
export function compare(input: CompareInput): CompareResult {
  const { model, asBuilt, config, root } = input;
  const findings: Finding[] = [];
  const modelEvidence = (kind: Evidence["kind"], line: number, detail: string): Evidence => ({
    kind,
    path: input.modelPath,
    line_start: line,
    line_end: line,
    provenance: "declared",
    detail,
  });

  // Model integrity.
  const issueGroups = new Map<
    string,
    { rule: string; subject: string; evidence: Evidence[]; details: string[] }
  >();
  for (const issue of model.issues) {
    const key = `${issue.rule}\u0000${issue.subject}`;
    const group = issueGroups.get(key) ?? {
      rule: issue.rule,
      subject: issue.subject,
      evidence: [],
      details: [],
    };
    group.evidence.push(
      modelEvidence(
        issue.rule === "model-invalid" ? "model-construct" : "model-reference",
        issue.line,
        issue.detail
      )
    );
    if (!group.details.includes(issue.detail)) group.details.push(issue.detail);
    issueGroups.set(key, group);
  }
  for (const g of issueGroups.values())
    findings.push(
      makeFinding(g.rule, g.subject, {
        summary: `${g.subject}: ${g.details.join("; ")}`,
        evidence: g.evidence,
      })
    );
  if (input.modelRepoPath !== null) {
    for (const ref of model.pathReferences) {
      const path = normalizeRelative(posix.join(dirOf(input.modelRepoPath), ref.path));
      if (path !== null && exists(root, path)) continue;
      findings.push(
        makeFinding("model-stale-reference", ref.path, {
          summary: `Referenced path ${ref.path} does not exist`,
          evidence: [modelEvidence("model-reference", ref.line, `references ${ref.path}`)],
        })
      );
    }
  }
  if (!model.usable) return { mapping: [], completeMapping: false, ignoredContainers: [], findings };

  // Declared lookups.
  const declared = new Map(model.elements.map((e) => [e.id, e]));
  const childrenOf = new Map<string, string[]>();
  for (const e of model.elements)
    if (e.parent !== null) childrenOf.set(e.parent, [...(childrenOf.get(e.parent) ?? []), e.id]);
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    let cur = declared.get(id)?.parent ?? null;
    while (cur !== null && !out.includes(cur)) {
      out.push(cur);
      cur = declared.get(cur)?.parent ?? null;
    }
    return out;
  };
  const subtree = (id: string): Set<string> => {
    const out = new Set<string>([id]);
    const queue = [id];
    while (queue.length > 0)
      for (const child of childrenOf.get(queue.shift() as string) ?? [])
        if (!out.has(child)) {
          out.add(child);
          queue.push(child);
        }
    return out;
  };
  const lineage = (id: string): Set<string> => new Set([...subtree(id), ...ancestors(id)]);
  const ignored = (id: string): boolean =>
    [id, ...ancestors(id)].some((x) => declared.get(x)?.ignore === true);
  const byIdSorted = (kind: DeclaredElement["kind"]): DeclaredElement[] =>
    model.elements.filter((e) => e.kind === kind).sort((a, b) => compareStrings(a.id, b.id));

  // Mapping (§4).
  const asBuiltToDeclared = new Map<string, string>();
  const declaredToAsBuilt = new Map<string, string[]>();
  const matchKind = new Map<string, "source" | "name">();
  const missing = new Map<string, string[]>();
  const assign = (declaredId: string, asBuiltId: string, kind: "source" | "name"): void => {
    if (asBuiltToDeclared.has(asBuiltId)) return;
    asBuiltToDeclared.set(asBuiltId, declaredId);
    declaredToAsBuilt.set(declaredId, [...(declaredToAsBuilt.get(declaredId) ?? []), asBuiltId]);
    if (!matchKind.has(declaredId)) matchKind.set(declaredId, kind);
  };
  const containers = asBuilt.elements.filter((e) => e.kind === "container");
  const declaredContainers = byIdSorted("container");
  for (const d of declaredContainers) {
    for (const value of d.sources) {
      const path = normalizeRelative(value);
      const lower = value.toLowerCase();
      const found =
        containers.find((c) => c.name === value || c.aliases.includes(value)) ??
        containers.find((c) => path !== null && c.source_paths.includes(path)) ??
        containers.find(
          (c) => c.name.toLowerCase() === lower || c.aliases.some((a) => a.toLowerCase() === lower)
        );
      if (found === undefined) missing.set(d.id, [...(missing.get(d.id) ?? []), value]);
      else assign(d.id, found.id, "source");
    }
  }
  const nameKeys = (e: DeclaredElement): Set<string> =>
    new Set([normalizeName(e.name), normalizeName(e.id.split(".").at(-1) ?? e.id)].filter(Boolean));
  for (const d of declaredContainers) {
    if (d.sources.length > 0) continue;
    const keys = nameKeys(d);
    const found = containers.find(
      (c) => !asBuiltToDeclared.has(c.id) && [c.name, ...c.aliases].some((n) => keys.has(normalizeName(n)))
    );
    if (found !== undefined) assign(d.id, found.id, "name");
  }
  for (const d of byIdSorted("component")) {
    if (d.parent === null) continue;
    const parents = new Set(declaredToAsBuilt.get(d.parent) ?? []);
    if (parents.size === 0) continue;
    const candidates = asBuilt.elements.filter((e) => e.kind === "component" && parents.has(e.parent ?? ""));
    if (d.sources.length > 0) {
      for (const value of d.sources) {
        const path = normalizeRelative(value);
        const found = candidates.find((c) => path !== null && c.source_paths.includes(path));
        if (found !== undefined) assign(d.id, found.id, "source");
        else if (input.graphPresent && (path === null || !exists(root, path)))
          missing.set(d.id, [...(missing.get(d.id) ?? []), value]);
      }
    } else {
      const keys = nameKeys(d);
      const found = candidates.find((c) => !asBuiltToDeclared.has(c.id) && keys.has(normalizeName(c.name)));
      if (found !== undefined) assign(d.id, found.id, "name");
    }
  }
  const externals = asBuilt.elements.filter((e) => e.kind === "external_system");
  for (const d of byIdSorted("external_system")) {
    if (d.sources.length > 0) {
      for (const ext of externals)
        if (ext.packages.some((p) => d.sources.some((v) => packageMatches(p, v))))
          assign(d.id, ext.id, "source");
    } else {
      const name = normalizeName(d.name);
      for (const ext of externals) {
        const key = normalizeName(ext.name);
        if (key !== "" && name.includes(key)) assign(d.id, ext.id, "name");
      }
    }
  }
  const scopeContainers = declaredContainers.filter((d) => !ignored(d.id));
  const completeMapping = scopeContainers.every((d) => d.sources.length > 0);
  const coverageStatus: Status = completeMapping ? "verified_static_fact" : "hypothesis";

  const mapping: MappingEntry[] = [...model.elements]
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((e) => {
      const observable = e.kind === "container" || e.kind === "component" || e.kind === "external_system";
      const ids = [...(declaredToAsBuilt.get(e.id) ?? [])].sort(compareStrings);
      return {
        declared_id: e.id,
        kind: e.kind,
        as_built_ids: ids,
        match: observable ? (matchKind.get(e.id) ?? "none") : "not-applicable",
        ignored: ignored(e.id),
      };
    });

  // container-undeclared, ignored containers.
  const ignoredContainers: string[] = [];
  for (const c of containers) {
    if (asBuiltToDeclared.has(c.id)) continue;
    if (!c.origins.some((o) => o === "compose" || o === "dockerfile" || o === "kubernetes")) continue;
    if ([c.name, ...c.aliases].some((n) => config.ignoreContainers.includes(n))) {
      ignoredContainers.push(c.name);
      continue;
    }
    findings.push(
      makeFinding("container-undeclared", c.name, {
        status: coverageStatus,
        summary: `Container ${c.name} (${c.descriptors.join(", ")}) maps to no declared container`,
        evidence: c.evidence,
        asBuilt: [c.id],
        suggested: suggestion(input.model.format, c),
      })
    );
  }

  // element-source-missing.
  for (const [id, values] of missing) {
    const d = declared.get(id) as DeclaredElement;
    if (ignored(id)) continue;
    findings.push(
      makeFinding("element-source-missing", id, {
        summary: `${id}: commons.source ${values.map((v) => JSON.stringify(v)).join(", ")} matches nothing`,
        evidence: [modelEvidence("model-element", d.line, `commons.source ${values.join(", ")}`)],
        declared: [id],
      })
    );
  }

  // component-undeclared.
  if (input.graphPresent) {
    for (const d of scopeContainers) {
      const declaredComponents = (childrenOf.get(d.id) ?? []).filter(
        (c) => declared.get(c)?.kind === "component"
      );
      if (declaredComponents.length === 0) continue;
      const parents = new Set(declaredToAsBuilt.get(d.id) ?? []);
      for (const comp of asBuilt.elements) {
        if (comp.kind !== "component" || !parents.has(comp.parent ?? "") || asBuiltToDeclared.has(comp.id))
          continue;
        findings.push(
          makeFinding("component-undeclared", comp.id, {
            summary: `Directory ${comp.source_paths[0] ?? comp.name} in ${d.id} is not a declared component`,
            evidence: comp.evidence,
            declared: [d.id],
            asBuilt: [comp.id],
            suggested: suggestion(input.model.format, comp),
          })
        );
      }
    }
  }

  // Lift as-built relationships to declared elements.
  const lift = (asBuiltId: string): string | null => {
    let cur: string | null = asBuiltId;
    while (cur !== null) {
      const d = asBuiltToDeclared.get(cur);
      if (d !== undefined) return d;
      const el = asBuilt.byId.get(cur);
      if (el === undefined || el.kind !== "component") return null;
      cur = el.parent;
    }
    return null;
  };
  interface Lifted {
    from: string;
    to: string;
    verified: boolean;
    evidence: Evidence[];
    asBuilt: Set<string>;
  }
  const lifted = new Map<string, Lifted>();
  for (const rel of asBuilt.relationships) {
    const from = lift(rel.from);
    const to = lift(rel.to);
    if (from === null || to === null) continue;
    if (from === to || ancestors(from).includes(to) || ancestors(to).includes(from)) continue;
    const key = `${from}\u0000${to}`;
    const entry = lifted.get(key) ?? { from, to, verified: false, evidence: [], asBuilt: new Set<string>() };
    const bySource = matchKind.get(from) === "source" && matchKind.get(to) === "source";
    if (rel.status === "verified_static_fact" && bySource) entry.verified = true;
    entry.evidence.push(...rel.evidence);
    entry.asBuilt.add(rel.from).add(rel.to);
    lifted.set(key, entry);
  }
  const liftedList = [...lifted.values()].sort(
    (a, b) => compareStrings(a.from, b.from) || compareStrings(a.to, b.to)
  );

  for (const l of liftedList) {
    if (ignored(l.from) || ignored(l.to)) continue;
    const status: Status = l.verified ? "verified_static_fact" : "hypothesis";
    const subject = `${l.from} -> ${l.to}`;
    const owner = [l.from, ...ancestors(l.from)]
      .map((id) => declared.get(id) as DeclaredElement)
      .find((e) => e.allowedDependencies !== null);
    if (owner !== undefined) {
      const allowed = new Set(owner.allowedDependencies);
      const ok = [l.to, ...ancestors(l.to)].some((x) => allowed.has(x)) || subtree(owner.id).has(l.to);
      if (!ok) {
        findings.push(
          makeFinding("boundary-violation", subject, {
            status,
            severity: l.verified ? "high" : "medium",
            summary: `${l.from} depends on ${l.to}, which commons.allowed-dependencies of ${owner.id} does not allow`,
            evidence: l.evidence,
            declared: [l.from, l.to],
            asBuilt: [...l.asBuilt],
          })
        );
        continue;
      }
    }
    const covered = model.relationships.some((r) => lineage(l.from).has(r.from) && lineage(l.to).has(r.to));
    if (covered) continue;
    const target = declared.get(l.to) as DeclaredElement;
    findings.push(
      makeFinding("relationship-undeclared", subject, {
        status,
        severity: target.kind === "external_system" ? "low" : "medium",
        summary: `${l.from} depends on ${l.to}, and no declared relationship covers it`,
        evidence: l.evidence,
        declared: [l.from, l.to],
        asBuilt: [...l.asBuilt],
      })
    );
  }

  // relationship-unobserved.
  const searched = input.graphPresent
    ? "compose dependencies, configuration host names, module imports and vendor SDK imports"
    : "compose dependencies and configuration host names (no module graph)";
  for (const r of model.relationships) {
    const a = declared.get(r.from) as DeclaredElement;
    const b = declared.get(r.to) as DeclaredElement;
    if (ignored(a.id) || ignored(b.id)) continue;
    const aObservable = (a.kind === "container" || a.kind === "component") && declaredToAsBuilt.has(a.id);
    const bObservable =
      ((b.kind === "container" || b.kind === "component") && declaredToAsBuilt.has(b.id)) ||
      b.kind === "external_system";
    if (!aObservable || !bObservable) continue;
    const sa = subtree(a.id);
    const sb = subtree(b.id);
    if (liftedList.some((l) => sa.has(l.from) && sb.has(l.to))) continue;
    findings.push(
      makeFinding("relationship-unobserved", `${a.id} -> ${b.id}`, {
        summary: `No static evidence for the declared relationship ${a.id} -> ${b.id} (searched ${searched})`,
        evidence: [modelEvidence("model-relationship", r.line, `declares ${a.id} -> ${b.id}`)],
        declared: [a.id, b.id],
      })
    );
  }

  // interface-unowned: a hypothesis when no container is declared, since ownership cannot be judged (D-101).
  const interfaceStatus: Status = scopeContainers.length === 0 ? "hypothesis" : coverageStatus;
  const mappedContainers = containers.filter(
    (c) => asBuiltToDeclared.has(c.id) && !ignored(asBuiltToDeclared.get(c.id) as string)
  );
  for (const iface of asBuilt.interfaces) {
    if (mappedContainers.some((c) => c.source_paths.some((s) => contains(s, iface.path)))) continue;
    findings.push(
      makeFinding("interface-unowned", iface.path, {
        status: interfaceStatus,
        summary: `${iface.format === "asyncapi" ? "AsyncAPI" : "OpenAPI"} ${iface.version} description ${iface.path} is outside every declared container`,
        evidence: [
          {
            kind: "interface-file",
            path: iface.path,
            line_start: iface.line,
            line_end: iface.line,
            provenance: "observed",
            detail: `${iface.format} ${iface.version}`,
          },
        ],
      })
    );
  }

  // technology-mismatch.
  for (const d of scopeContainers) {
    if (d.technology === null) continue;
    const families = familiesOfText(d.technology);
    if (families.length === 0) continue;
    for (const id of [...(declaredToAsBuilt.get(d.id) ?? [])].sort(compareStrings)) {
      const c = asBuilt.byId.get(id) as AsBuiltElement;
      const evidence = asBuilt.technologyEvidence.get(id);
      if (c.technology === null || evidence === undefined || families.includes(c.technology)) continue;
      findings.push(
        makeFinding("technology-mismatch", d.id, {
          summary: `${d.id} is declared as ${d.technology} but is built from a ${c.technology} image`,
          evidence: [evidence, modelEvidence("model-element", d.line, `technology ${d.technology}`)],
          declared: [d.id],
          asBuilt: [c.id],
        })
      );
      break;
    }
  }

  // external-system-undeclared.
  for (const ext of externals) {
    if (asBuiltToDeclared.has(ext.id)) continue;
    const users = asBuilt.relationships.filter(
      (r) => r.to === ext.id && lift(r.from) !== null && !ignored(lift(r.from) as string)
    );
    if (users.length === 0) continue;
    findings.push(
      makeFinding("external-system-undeclared", ext.name, {
        summary: `${ext.name} SDK (${ext.packages.join(", ")}) is imported, and no declared external system maps to it`,
        evidence: users.flatMap((r) => r.evidence),
        declared: [...new Set(users.map((r) => lift(r.from) as string))],
        asBuilt: [ext.id],
      })
    );
  }

  return { mapping, completeMapping, ignoredContainers: ignoredContainers.sort(compareStrings), findings };
}
