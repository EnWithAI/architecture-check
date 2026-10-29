// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Readers for compose files, plain Kubernetes manifests and API descriptions (docs/SPEC.md §3.2–3.5). They return
 * neutral records with line numbers. Environment values are reduced to the host they name (if any) and never kept.
 */
import { isObject, lineOf, parseYaml, pointerSegment } from "./yaml.js";
/** The host named by a configuration value (`scheme://[user@]host[:port]…` or `host:port`), lower case, or null. */
export function hostOf(value) {
    const url = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#\s]*@)?([^:/?#\s[\]]+)/i.exec(value.trim());
    if (url)
        return url[1].toLowerCase();
    const hostPort = /^([a-z0-9][a-z0-9.-]*):(\d{1,5})(?:\/\S*)?$/i.exec(value.trim());
    return hostPort ? hostPort[1].toLowerCase() : null;
}
function str(value) {
    return typeof value === "string" && value.trim() !== "" ? value : null;
}
function stringMap(value) {
    const out = {};
    if (!isObject(value))
        return out;
    for (const [k, v] of Object.entries(value))
        if (typeof v === "string" || typeof v === "number")
            out[k] = String(v);
    return out;
}
/** Environment host references from a compose `environment` (map or `KEY=VALUE` list). */
function composeHosts(env, doc, pointer) {
    const out = [];
    if (isObject(env)) {
        for (const [key, value] of Object.entries(env)) {
            const host = typeof value === "string" ? hostOf(value) : null;
            if (host)
                out.push({ variable: key, host, line: lineOf(doc, `${pointer}/${pointerSegment(key)}`) });
        }
    }
    else if (Array.isArray(env)) {
        env.forEach((item, i) => {
            if (typeof item !== "string")
                return;
            const eq = item.indexOf("=");
            if (eq <= 0)
                return;
            const host = hostOf(item.slice(eq + 1));
            if (host)
                out.push({ variable: item.slice(0, eq), host, line: lineOf(doc, `${pointer}/${i}`) });
        });
    }
    return out;
}
/** Reads the services of a compose file; null when it cannot be parsed. */
export function readCompose(file, text) {
    const docs = parseYaml(text);
    if (docs === null)
        return null;
    const doc = docs[0];
    if (doc === undefined || !isObject(doc.value))
        return [];
    const services = doc.value["services"];
    if (!isObject(services))
        return [];
    const out = [];
    for (const name of Object.keys(services)) {
        const svc = services[name];
        if (!isObject(svc))
            continue;
        const base = `/services/${pointerSegment(name)}`;
        const build = svc["build"];
        let buildContext = null;
        let dockerfile = null;
        if (typeof build === "string")
            buildContext = build;
        else if (isObject(build)) {
            buildContext = str(build["context"]) ?? ".";
            dockerfile = str(build["dockerfile"]);
        }
        const dependsOn = [];
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
                        name: l.split(":")[0],
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
/** Reads Kubernetes resources and API descriptions from a YAML or JSON file; null when it cannot be parsed. */
export function readYamlContent(file, text) {
    const docs = parseYaml(text);
    if (docs === null)
        return null;
    const content = { workloads: [], services: [], apis: [] };
    for (const doc of docs) {
        const root = doc.value;
        if (!isObject(root))
            continue;
        for (const key of ["openapi", "swagger", "asyncapi"]) {
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
        if (typeof root["apiVersion"] !== "string" || typeof kind !== "string" || !isObject(metadata))
            continue;
        const name = str(metadata["name"]);
        if (name === null)
            continue;
        const spec = isObject(root["spec"]) ? root["spec"] : {};
        if (kind === "Service") {
            const selector = stringMap(spec["selector"]);
            if (Object.keys(selector).length > 0)
                content.services.push({ file, name, selector });
            continue;
        }
        if (!WORKLOAD_KINDS.has(kind))
            continue;
        let templatePointer = "/spec/template";
        let template = spec["template"];
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
        let image = null;
        let imageLine = lineOf(doc, "/metadata/name");
        const hosts = [];
        containers.forEach((c, ci) => {
            if (!isObject(c))
                return;
            const cPointer = `${templatePointer}/spec/containers/${ci}`;
            if (image === null && str(c["image"]) !== null) {
                image = str(c["image"]);
                imageLine = lineOf(doc, `${cPointer}/image`);
            }
            const env = Array.isArray(c["env"]) ? c["env"] : [];
            env.forEach((e, ei) => {
                if (!isObject(e) || typeof e["name"] !== "string" || typeof e["value"] !== "string")
                    return;
                const host = hostOf(e["value"]);
                if (host)
                    hosts.push({ variable: e["name"], host, line: lineOf(doc, `${cPointer}/env/${ei}`) });
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
