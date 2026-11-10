// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Builds the as-built model from static evidence (docs/SPEC.md §3.2–3.5): containers from compose services,
 * Dockerfiles and Kubernetes workloads (plus declared source paths, workspace packages and the root package), components and import
 * relationships from the Impact Check module graph, configuration relationships from compose dependencies and host
 * names in environment values, external systems from vendor SDK imports, and API descriptions.
 */
import { builtinModules } from "node:module";
import { posix } from "node:path";
import { readText } from "../input/walk.js";
import { readDockerfile } from "../parse/dockerfile.js";
import { readCompose, readYamlContent } from "../parse/descriptors.js";
import { compareStrings, contains, dirOf, joinRelative, normalizeRelative, slug, uniqueSorted, } from "../util/paths.js";
import { familyOfImage, isDatastore } from "./technology.js";
import { packageOf, vendorOf } from "./vendors.js";
const BUILTINS = new Set(builtinModules);
/** Sorts evidence by path, then line. */
export function sortEvidence(evidence) {
    return [...evidence].sort((a, b) => compareStrings(a.path, b.path) ||
        (a.line_start ?? 0) - (b.line_start ?? 0) ||
        compareStrings(a.kind, b.kind) ||
        compareStrings(a.detail, b.detail));
}
/**
 * Reads the root `package.json`: its `name`, and whether it is a workspace root (`workspaces`, or a
 * `pnpm-workspace.yaml` beside it). Unparseable manifests count as present, without a name.
 */
function readRootPackage(root, files, limitations) {
    const text = readText(root, "package.json", limitations);
    if (text === null)
        return null;
    let manifest = {};
    try {
        const parsed = JSON.parse(text);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed))
            manifest = parsed;
    }
    catch {
        // Treated as a manifest without a name.
    }
    const raw = manifest["name"];
    const name = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
    const index = text.split("\n").findIndex((line) => /^\s*"name"\s*:/.test(line));
    const line = name !== null && index >= 0 ? index + 1 : 1;
    return {
        name,
        workspaceRoot: manifest["workspaces"] !== undefined || files.all.includes("pnpm-workspace.yaml"),
        evidence: {
            kind: "package-manifest",
            path: "package.json",
            line_start: line,
            line_end: line,
            provenance: "observed",
            detail: name === null ? "package.json without a usable name" : `package ${name}`,
        },
    };
}
/** Builds the as-built model. `extraSources` are declared source directories with no deployment descriptor. */
export function buildAsBuilt(root, files, config, graph, extraSources, limitations) {
    const drafts = new Map();
    const draft = (name) => {
        let d = drafts.get(name);
        if (d === undefined) {
            d = {
                name,
                aliases: new Set(),
                origins: new Set(),
                sources: new Set(),
                descriptors: new Set(),
                evidence: [],
                labels: [],
                dockerfiles: new Set(),
                dockerImage: null,
                composeImage: null,
                k8sImage: null,
                deps: [],
                hosts: [],
            };
            drafts.set(name, d);
        }
        return d;
    };
    // 1. Compose services.
    for (const file of files.compose) {
        const text = readText(root, file, limitations);
        if (text === null)
            continue;
        const services = readCompose(file, text);
        if (services === null) {
            limitations.add("yaml-unparseable", file);
            continue;
        }
        for (const svc of services) {
            const d = draft(svc.name);
            d.origins.add("compose");
            d.descriptors.add(file);
            d.evidence.push({
                kind: "compose-service",
                path: file,
                line_start: svc.line,
                line_end: svc.line,
                provenance: "observed",
                detail: `compose service ${svc.name}`,
            });
            if (svc.buildContext !== null) {
                const context = joinRelative(dirOf(file), svc.buildContext);
                const dockerfile = context === null ? null : joinRelative(context, svc.dockerfile ?? "Dockerfile");
                if (context === null || dockerfile === null)
                    limitations.add("path-outside-root", file);
                else {
                    d.sources.add(context);
                    d.dockerfiles.add(dockerfile);
                }
            }
            if (svc.image !== null && d.composeImage === null)
                d.composeImage = {
                    image: svc.image,
                    evidence: {
                        kind: "compose-image",
                        path: file,
                        line_start: svc.imageLine,
                        line_end: svc.imageLine,
                        provenance: "observed",
                        detail: `image ${svc.image}`,
                    },
                };
            for (const dep of svc.dependsOn)
                d.deps.push({ file, ...dep });
            for (const host of svc.hosts)
                d.hosts.push({ ...host, file, kind: "compose-environment" });
        }
    }
    // 2. Dockerfiles (attached to the compose services that build them, otherwise containers of their own).
    const used = new Set([...drafts.values()].flatMap((d) => [...d.dockerfiles]));
    for (const file of files.dockerfiles) {
        const text = readText(root, file, limitations);
        if (text === null)
            continue;
        const info = readDockerfile(text);
        const targets = used.has(file)
            ? [...drafts.values()].filter((d) => d.dockerfiles.has(file))
            : [draft(dirOf(file) === "." ? "app" : posix.basename(dirOf(file)))];
        for (const d of targets) {
            if (!used.has(file)) {
                d.origins.add("dockerfile");
                d.sources.add(dirOf(file));
            }
            d.descriptors.add(file);
            const evidence = {
                kind: "dockerfile",
                path: file,
                line_start: info.line,
                line_end: info.line,
                provenance: "observed",
                detail: info.image === null ? "no resolvable FROM image" : `FROM ${info.image}`,
            };
            d.evidence.push(evidence);
            if (info.image !== null && d.dockerImage === null)
                d.dockerImage = { image: info.image, evidence };
        }
    }
    // 3. Kubernetes workloads and Services, API descriptions.
    const k8sServices = [];
    const interfaceDocs = [];
    for (const file of [...files.yaml, ...files.apiJson].sort(compareStrings)) {
        const text = readText(root, file, limitations);
        if (text === null)
            continue;
        const content = readYamlContent(file, text);
        if (content === null) {
            limitations.add("yaml-unparseable", file);
            continue;
        }
        interfaceDocs.push(...content.apis);
        k8sServices.push(...content.services);
        for (const w of content.workloads) {
            const d = draft(w.name);
            d.origins.add("kubernetes");
            d.descriptors.add(file);
            d.labels.push(w.labels);
            d.evidence.push({
                kind: "k8s-resource",
                path: file,
                line_start: w.line,
                line_end: w.line,
                provenance: "observed",
                detail: `kubernetes workload ${w.name}`,
            });
            if (w.image !== null && d.k8sImage === null)
                d.k8sImage = {
                    image: w.image,
                    evidence: {
                        kind: "k8s-image",
                        path: file,
                        line_start: w.imageLine,
                        line_end: w.imageLine,
                        provenance: "observed",
                        detail: `image ${w.image}`,
                    },
                };
            for (const host of w.hosts)
                d.hosts.push({ ...host, file, kind: "k8s-environment" });
        }
    }
    for (const svc of k8sServices) {
        for (const d of drafts.values()) {
            const selected = d.labels.some((labels) => Object.entries(svc.selector).every(([k, v]) => labels[k] === v));
            if (selected && svc.name !== d.name)
                d.aliases.add(svc.name);
        }
    }
    // 4. Declared source directories with no deployment descriptor.
    const sourceOwners = () => [...drafts.values()].flatMap((d) => [...d.sources]);
    for (const path of uniqueSorted(extraSources)) {
        if (path === "." || sourceOwners().includes(path))
            continue;
        const d = draft(path);
        d.origins.add("declared-source");
        d.sources.add(path);
    }
    // 5. Workspace packages from the module graph.
    const sourceModules = graph === null ? [] : graph.modules.filter((m) => m.kind === "source");
    if (graph !== null) {
        for (const pkg of [...graph.workspacePackages].sort((a, b) => compareStrings(a.path, b.path))) {
            const path = normalizeRelative(pkg.path);
            if (path === null || path === ".")
                continue;
            const owner = [...drafts.values()].find((d) => d.sources.has(path));
            if (owner !== undefined) {
                if (owner.name !== pkg.name)
                    owner.aliases.add(pkg.name);
                continue;
            }
            const owned = sourceOwners();
            const uncovered = sourceModules.some((m) => contains(path, m.path) && !owned.some((s) => contains(s, m.path)));
            if (!uncovered)
                continue;
            const d = draft(pkg.name);
            d.origins.add("workspace-package");
            d.sources.add(path);
        }
    }
    // 6. The repository root (D-100): a declared `.` source, or the root package when nothing else is a container.
    const rootDeclared = extraSources.includes(".");
    if (!sourceOwners().includes(".")) {
        const manifest = files.all.includes("package.json") ? readRootPackage(root, files, limitations) : null;
        const rootPackage = manifest !== null && !manifest.workspaceRoot && drafts.size === 0;
        if (rootDeclared || rootPackage) {
            const name = manifest?.name ?? "app";
            const d = draft(drafts.has(name) ? `${name} (repository root)` : name);
            if (rootDeclared)
                d.origins.add("declared-source");
            if (manifest !== null) {
                d.origins.add("root-package");
                d.evidence.push(manifest.evidence);
            }
            d.sources.add(".");
        }
    }
    // 7. Container elements with stable ids.
    const elements = [];
    const byId = new Map();
    const idOfDraft = new Map();
    const technologyEvidence = new Map();
    const takeId = (base) => {
        let id = base;
        for (let n = 2; byId.has(id); n++)
            id = `${base}_${n}`;
        return id;
    };
    for (const d of [...drafts.values()].sort((a, b) => compareStrings(a.name, b.name))) {
        const id = takeId(slug(d.name));
        const image = d.dockerImage ?? d.composeImage ?? d.k8sImage;
        const technology = image === null ? null : familyOfImage(image.image);
        if (image !== null && technology !== null)
            technologyEvidence.set(id, image.evidence);
        const element = {
            id,
            kind: "container",
            name: d.name,
            aliases: uniqueSorted(d.aliases),
            parent: null,
            node_type: isDatastore(technology) ? "database" : "service",
            origins: uniqueSorted(d.origins),
            source_paths: uniqueSorted(d.sources),
            packages: [],
            technology,
            descriptors: uniqueSorted(d.descriptors),
            evidence: sortEvidence(d.evidence),
        };
        elements.push(element);
        byId.set(id, element);
        idOfDraft.set(d, id);
    }
    const containerOfPath = (path) => {
        let best = null;
        for (const el of elements) {
            if (el.kind !== "container")
                continue;
            for (const s of el.source_paths) {
                if (!contains(s, path))
                    continue;
                const length = s === "." ? 0 : s.length + 1;
                if (best === null || length > best.length)
                    best = { id: el.id, length };
            }
        }
        return best?.id ?? null;
    };
    // 8. Components and module → element assignment.
    const elementOfModule = new Map();
    if (graph !== null) {
        const containerIds = elements.map((e) => e.id);
        for (const containerId of containerIds) {
            const container = byId.get(containerId);
            const modules = sourceModules.filter((m) => containerOfPath(m.path) === containerId);
            for (const m of modules)
                elementOfModule.set(m.path, containerId);
            if (modules.length === 0) {
                if (container.source_paths.some((s) => files.otherLanguage.some((f) => contains(s, f))))
                    for (const s of container.source_paths)
                        limitations.add("component-graph-language-unsupported", s);
                continue;
            }
            for (const s of container.source_paths) {
                const srcDir = s === "." ? "src" : `${s}/src`;
                const inSource = modules.filter((m) => contains(s, m.path));
                const rootDir = inSource.some((m) => contains(srcDir, m.path)) ? srcDir : s;
                for (const m of inSource) {
                    if (!contains(rootDir, m.path))
                        continue;
                    const rest = rootDir === "." ? m.path : m.path.slice(rootDir.length + 1);
                    const slash = rest.indexOf("/");
                    if (slash < 0)
                        continue;
                    const dir = rest.slice(0, slash);
                    const path = rootDir === "." ? dir : `${rootDir}/${dir}`;
                    const id = `${containerId}.${slug(dir)}`;
                    if (!byId.has(id)) {
                        const component = {
                            id,
                            kind: "component",
                            name: dir,
                            aliases: [],
                            parent: containerId,
                            node_type: "component",
                            origins: ["graph"],
                            source_paths: [path],
                            packages: [],
                            technology: null,
                            descriptors: [],
                            evidence: [
                                {
                                    kind: "component-directory",
                                    path,
                                    line_start: null,
                                    line_end: null,
                                    provenance: "graph",
                                    detail: "directory with source modules",
                                },
                            ],
                        };
                        elements.push(component);
                        byId.set(id, component);
                    }
                    elementOfModule.set(m.path, id);
                }
            }
        }
    }
    // 9. Relationships.
    const relationships = new Map();
    const parentOf = (id) => byId.get(id)?.parent ?? null;
    const related = (a, b) => a === b || parentOf(a) === b || parentOf(b) === a;
    const addRelationship = (from, to, label, evidence, verified) => {
        if (related(from, to))
            return;
        const key = `${from}\u0000${to}`;
        let rel = relationships.get(key);
        if (rel === undefined) {
            rel = { from, to, labels: [], status: "hypothesis", evidence: [], evidence_total: 0 };
            relationships.set(key, rel);
        }
        if (!rel.labels.includes(label))
            rel.labels.push(label);
        rel.evidence.push(evidence);
        if (verified)
            rel.status = "verified_static_fact";
    };
    const draftByName = (name) => {
        const lower = name.toLowerCase();
        for (const d of drafts.values())
            if (d.name.toLowerCase() === lower || [...d.aliases].some((a) => a.toLowerCase() === lower))
                return d;
        return null;
    };
    for (const d of drafts.values()) {
        const from = idOfDraft.get(d);
        for (const dep of d.deps) {
            const target = draftByName(dep.name);
            if (target === null || target === d)
                continue;
            addRelationship(from, idOfDraft.get(target), dep.label, {
                kind: "compose-dependency",
                path: dep.file,
                line_start: dep.line,
                line_end: dep.line,
                provenance: "observed",
                detail: `${dep.label} ${dep.name}`,
            }, true);
        }
        for (const host of d.hosts) {
            const target = draftByName(host.host);
            if (target === null || target === d)
                continue;
            addRelationship(from, idOfDraft.get(target), `env ${host.variable}`, {
                kind: host.kind,
                path: host.file,
                line_start: host.line,
                line_end: host.line,
                provenance: "inferred",
                detail: `${host.variable} names host ${host.host}`,
            }, false);
        }
    }
    if (graph !== null) {
        const kinds = new Map(graph.modules.map((m) => [m.path, m.kind]));
        for (const edge of graph.edges) {
            if (edge.typeOnly || kinds.get(edge.from) !== "source" || kinds.get(edge.to) !== "source")
                continue;
            const from = elementOfModule.get(edge.from);
            const to = elementOfModule.get(edge.to);
            if (from === undefined || to === undefined)
                continue;
            addRelationship(from, to, "imports", {
                kind: "import",
                path: edge.from,
                line_start: edge.line,
                line_end: edge.line,
                provenance: edge.provenance,
                detail: `imports ${edge.to}`,
            }, edge.provenance === "graph");
        }
        for (const x of graph.externalImports) {
            if (kinds.get(x.from) !== "source")
                continue;
            const from = elementOfModule.get(x.from);
            const pkg = packageOf(x.specifier);
            if (from === undefined || pkg === null || BUILTINS.has(pkg))
                continue;
            const vendor = vendorOf(pkg, config.externalSdks);
            if (vendor === null)
                continue;
            let external = elements.find((e) => e.kind === "external_system" && e.name === vendor);
            if (external === undefined) {
                external = {
                    id: takeId(byId.has(slug(vendor)) ? `${slug(vendor)}_external` : slug(vendor)),
                    kind: "external_system",
                    name: vendor,
                    aliases: [],
                    parent: null,
                    node_type: "ecosystem",
                    origins: ["vendor-sdk"],
                    source_paths: [],
                    packages: [],
                    technology: null,
                    descriptors: [],
                    evidence: [],
                };
                elements.push(external);
                byId.set(external.id, external);
            }
            if (!external.packages.includes(pkg))
                external.packages = uniqueSorted([...external.packages, pkg]);
            const evidence = {
                kind: "external-import",
                path: x.from,
                line_start: x.line,
                line_end: x.line,
                provenance: "graph",
                detail: `imports ${pkg}`,
            };
            external.evidence = sortEvidence([...external.evidence, evidence]);
            addRelationship(from, external.id, "imports", evidence, true);
        }
    }
    // 10. API descriptions.
    const interfaces = interfaceDocs
        .map((doc) => ({
        path: doc.file,
        line: doc.line,
        format: doc.format,
        version: doc.version,
        owner: containerOfPath(doc.file),
    }))
        .sort((a, b) => compareStrings(a.path, b.path) || a.line - b.line);
    elements.sort((a, b) => compareStrings(a.id, b.id));
    const rels = [...relationships.values()]
        .map((r) => ({
        ...r,
        labels: uniqueSorted(r.labels),
        evidence: sortEvidence(r.evidence),
        evidence_total: r.evidence.length,
    }))
        .sort((a, b) => compareStrings(a.from, b.from) || compareStrings(a.to, b.to));
    return { elements, relationships: rels, interfaces, byId, technologyEvidence };
}
