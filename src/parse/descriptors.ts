// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Readers for compose files, plain Kubernetes manifests and API descriptions (docs/SPEC.md §3.2–3.5). They return
 * neutral records with line numbers. Environment values are reduced to the host they name (if any) and never kept.
 */
import { isObject, lineOf, parseYaml, pointerSegment, type YamlDoc } from "./yaml.js";

/** A reference from one container to a host name or service, with its location. */
export interface HostReference {
  variable: string;
  host: string;
  line: number;
}

/** A compose service. */
export interface ComposeService {
  file: string;
  name: string;
  line: number;
  buildContext: string | null;
  dockerfile: string | null;
  image: string | null;
  imageLine: number;
  dependsOn: { name: string; line: number; label: "depends_on" | "links" }[];
  hosts: HostReference[];
}

/** A Kubernetes workload (Deployment, StatefulSet, DaemonSet, Job, CronJob). */
export interface K8sWorkload {
  file: string;
  name: string;
  line: number;
  labels: Record<string, string>;
  image: string | null;
  imageLine: number;
  hosts: HostReference[];
}

/** A Kubernetes Service with a label selector. */
export interface K8sService {
  file: string;
  name: string;
  selector: Record<string, string>;
}

/** An API description document. */
export interface ApiDocument {
  file: string;
  format: "openapi" | "asyncapi";
  version: string;
  line: number;
}

/** The host named by a configuration value (`scheme://[user@]host[:port]…` or `host:port`), lower case, or null. */
export function hostOf(value: string): string | null {
  const url = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#\s]*@)?([^:/?#\s[\]]+)/i.exec(value.trim());
  if (url) return (url[1] as string).toLowerCase();
  const hostPort = /^([a-z0-9][a-z0-9.-]*):(\d{1,5})(?:\/\S*)?$/i.exec(value.trim());
  return hostPort ? (hostPort[1] as string).toLowerCase() : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function stringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObject(value)) return out;
  for (const [k, v] of Object.entries(value))
    if (typeof v === "string" || typeof v === "number") out[k] = String(v);
  return out;
}

/** Environment host references from a compose `environment` (map or `KEY=VALUE` list). */
function composeHosts(env: unknown, doc: YamlDoc, pointer: string): HostReference[] {
  const out: HostReference[] = [];
  if (isObject(env)) {
    for (const [key, value] of Object.entries(env)) {
      const host = typeof value === "string" ? hostOf(value) : null;
      if (host) out.push({ variable: key, host, line: lineOf(doc, `${pointer}/${pointerSegment(key)}`) });
    }
  } else if (Array.isArray(env)) {
    env.forEach((item, i) => {
      if (typeof item !== "string") return;
      const eq = item.indexOf("=");
      if (eq <= 0) return;
      const host = hostOf(item.slice(eq + 1));
      if (host) out.push({ variable: item.slice(0, eq), host, line: lineOf(doc, `${pointer}/${i}`) });
    });
  }
  return out;
}

/** Reads the services of a compose file; null when it cannot be parsed. */
export function readCompose(file: string, text: string): ComposeService[] | null {
  const docs = parseYaml(text);
  if (docs === null) return null;
  const doc = docs[0];
  if (doc === undefined || !isObject(doc.value)) return [];
  const services = doc.value["services"];
  if (!isObject(services)) return [];
  const out: ComposeService[] = [];
  for (const name of Object.keys(services)) {
    const svc = services[name];
    if (!isObject(svc)) continue;
    const base = `/services/${pointerSegment(name)}`;
    const build = svc["build"];
    let buildContext: string | null = null;
    let dockerfile: string | null = null;
    if (typeof build === "string") buildContext = build;
    else if (isObject(build)) {
      buildContext = str(build["context"]) ?? ".";
      dockerfile = str(build["dockerfile"]);
    }
    const dependsOn: ComposeService["dependsOn"] = [];
    const deps = svc["depends_on"];
    if (Array.isArray(deps))
      deps.forEach((d, i) => {
        if (typeof d === "string")
          dependsOn.push({ name: d, line: lineOf(doc, `${base}/depends_on/${i}`), label: "depends_on" });
      });
    else if (isObject(deps))
      for (const d of Object.keys(deps))
        dependsOn.push({
          name: d,
          line: lineOf(doc, `${base}/depends_on/${pointerSegment(d)}`),
          label: "depends_on",
        });
    const links = svc["links"];
    if (Array.isArray(links))
      links.forEach((l, i) => {
        if (typeof l === "string")
          dependsOn.push({
            name: l.split(":")[0] as string,
            line: lineOf(doc, `${base}/links/${i}`),
            label: "links",
          });
      });
    out.push({
      file,
      name,
      line: lineOf(doc, base),
      buildContext,
      dockerfile,
      image: str(svc["image"]),
      imageLine: lineOf(doc, `${base}/image`),
      dependsOn,
      hosts: composeHosts(svc["environment"], doc, `${base}/environment`),
    });
  }
  return out;
}

const WORKLOAD_KINDS = new Set(["Deployment", "StatefulSet", "DaemonSet", "Job", "CronJob"]);

/** Kubernetes workloads, Services and API descriptions found in one YAML/JSON file. */
export interface YamlContent {
  workloads: K8sWorkload[];
  services: K8sService[];
  apis: ApiDocument[];
}

/** Reads Kubernetes resources and API descriptions from a YAML or JSON file; null when it cannot be parsed. */
export function readYamlContent(file: string, text: string): YamlContent | null {
  const docs = parseYaml(text);
  if (docs === null) return null;
  const content: YamlContent = { workloads: [], services: [], apis: [] };
  for (const doc of docs) {
    const root = doc.value;
    if (!isObject(root)) continue;
    for (const key of ["openapi", "swagger", "asyncapi"] as const) {
      const v = root[key];
      if (typeof v === "string" || typeof v === "number") {
        content.apis.push({
          file,
          format: key === "asyncapi" ? "asyncapi" : "openapi",
          version: String(v),
          line: lineOf(doc, `/${key}`),
        });
        break;
      }
    }
    const kind = root["kind"];
    const metadata = root["metadata"];
    if (typeof root["apiVersion"] !== "string" || typeof kind !== "string" || !isObject(metadata)) continue;
    const name = str(metadata["name"]);
    if (name === null) continue;
    const spec = isObject(root["spec"]) ? root["spec"] : {};
    if (kind === "Service") {
      const selector = stringMap(spec["selector"]);
      if (Object.keys(selector).length > 0) content.services.push({ file, name, selector });
      continue;
    }
    if (!WORKLOAD_KINDS.has(kind)) continue;
    let templatePointer = "/spec/template";
    let template: unknown = spec["template"];
    if (kind === "CronJob") {
      const jobTemplate = spec["jobTemplate"];
      const jobSpec = isObject(jobTemplate) ? jobTemplate["spec"] : undefined;
      template = isObject(jobSpec) ? jobSpec["template"] : undefined;
      templatePointer = "/spec/jobTemplate/spec/template";
    }
    const tmpl = isObject(template) ? template : {};
    const tmplMeta = isObject(tmpl["metadata"]) ? tmpl["metadata"] : {};
    const podSpec = isObject(tmpl["spec"]) ? tmpl["spec"] : {};
    const containers = Array.isArray(podSpec["containers"]) ? podSpec["containers"] : [];
    let image: string | null = null;
    let imageLine = lineOf(doc, "/metadata/name");
    const hosts: HostReference[] = [];
    containers.forEach((c, ci) => {
      if (!isObject(c)) return;
      const cPointer = `${templatePointer}/spec/containers/${ci}`;
      if (image === null && str(c["image"]) !== null) {
        image = str(c["image"]);
        imageLine = lineOf(doc, `${cPointer}/image`);
      }
      const env = Array.isArray(c["env"]) ? c["env"] : [];
      env.forEach((e, ei) => {
        if (!isObject(e) || typeof e["name"] !== "string" || typeof e["value"] !== "string") return;
        const host = hostOf(e["value"]);
        if (host) hosts.push({ variable: e["name"], host, line: lineOf(doc, `${cPointer}/env/${ei}`) });
      });
    });
    content.workloads.push({
      file,
      name,
      line: lineOf(doc, "/metadata/name"),
      labels: stringMap(tmplMeta["labels"]),
      image,
      imageLine,
      hosts,
    });
  }
  return content;
}
