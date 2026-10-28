// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Report types. The JSON report (schema/architecture-check-report.schema.json, schema 1.0) is a direct
 * serialization of `Report`; the Markdown, SARIF, DSL and CALM outputs are renderings of it.
 */

/** How a finding is known: a structural fact, a heuristic a human should confirm, or undecidable. */
export type Status = "verified_static_fact" | "hypothesis" | "unknown";

/** Ordinal severity (no scores). */
export type Severity = "high" | "medium" | "low" | "info";

/** Where a piece of evidence comes from. */
export type Provenance = "declared" | "observed" | "graph" | "inferred";

/** Evidence kinds. */
export type EvidenceKind =
  | "model-element"
  | "model-relationship"
  | "model-construct"
  | "model-reference"
  | "compose-service"
  | "compose-dependency"
  | "compose-environment"
  | "compose-image"
  | "dockerfile"
  | "k8s-resource"
  | "k8s-image"
  | "k8s-environment"
  | "import"
  | "external-import"
  | "component-directory"
  | "interface-file"
  | "package-manifest";

/** One piece of evidence: a file location (line may be null for directories). */
export interface Evidence {
  kind: EvidenceKind;
  path: string;
  line_start: number | null;
  line_end: number | null;
  provenance: Provenance;
  detail: string;
}

/** Element kinds of the C4-style model. */
export type ElementKind = "person" | "software_system" | "container" | "component" | "external_system";

/** An element of the as-built model. */
export interface AsBuiltElement {
  id: string;
  kind: "container" | "component" | "external_system";
  name: string;
  aliases: string[];
  parent: string | null;
  node_type: "service" | "database" | "component" | "ecosystem";
  origins: string[];
  source_paths: string[];
  packages: string[];
  technology: string | null;
  descriptors: string[];
  evidence: Evidence[];
}

/** A relationship of the as-built model (between as-built element ids). */
export interface AsBuiltRelationship {
  from: string;
  to: string;
  labels: string[];
  status: "verified_static_fact" | "hypothesis";
  evidence: Evidence[];
  evidence_total: number;
}

/** An API description found in the repository. */
export interface ApiInterface {
  path: string;
  line: number;
  format: "openapi" | "asyncapi";
  version: string;
  owner: string | null;
}

/** One declared element's mapping to the as-built model. */
export interface MappingEntry {
  declared_id: string;
  kind: ElementKind;
  as_built_ids: string[];
  match: "source" | "name" | "none" | "not-applicable";
  ignored: boolean;
}

/** A finding. */
export interface Finding {
  id: string;
  rule_id: string;
  category: string;
  severity: Severity;
  status: Status;
  confidence: "high" | "medium" | "low";
  is_heuristic: boolean;
  subject: string;
  summary: string;
  declared_elements: string[];
  as_built_elements: string[];
  evidence: Evidence[];
  evidence_total: number;
  recommended_human_action: string;
  suggested_model_change: string | null;
  change_status: "introduced" | "pre-existing" | null;
}

/** A known gap in what was analyzed. */
export interface Limitation {
  code: string;
  message: string;
  count: number;
  paths: string[];
}

/** Policy outcome. */
export interface PolicyResult {
  evaluated: boolean;
  result: "pass" | "fail" | "not_evaluated";
  fail_on_severity: Severity | "never";
  fail_on_statuses: Status[];
  violations: string[];
}

/** A file read as an input. */
export interface InputInfo {
  path: string;
  schema_version: string;
  sha256: string;
}

/** The declared model that was compared. */
export interface DeclaredModelInfo {
  path: string;
  format: "dsl" | "calm";
  schema: string | null;
  sha256: string;
  usable: boolean;
  elements: number;
  relationships: number;
}

/** Counts. */
export interface Summary {
  findings: number;
  by_status: Record<Status, number>;
  by_severity: Record<Severity, number>;
  by_rule: Record<string, number>;
  as_built_elements: number;
  as_built_relationships: number;
  interfaces: number;
}

/** The complete report. */
export interface Report {
  schema_version: "1.0";
  kind: "architecture-check-report";
  tool: { name: "architecture-check"; version: string };
  command: "derive" | "analyze" | "check";
  declared_model: DeclaredModelInfo | null;
  inputs: { graph: InputInfo | null; impact_check: InputInfo | null };
  as_built: {
    system_name: string;
    elements: AsBuiltElement[];
    relationships: AsBuiltRelationship[];
    interfaces: ApiInterface[];
  };
  mapping: MappingEntry[];
  complete_mapping: boolean | null;
  findings: Finding[];
  summary: Summary;
  policy: PolicyResult;
  ignored_containers: string[];
  coverage_limitations: Limitation[];
  run_metadata: { generated_at: string; tool_version: string; node_version: string; duration_ms: number };
}
