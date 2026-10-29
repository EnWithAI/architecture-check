import { uniqueSorted } from "./util/paths.js";
/** Message for every limitation code. */
export const LIMITATION_MESSAGES = {
    "no-module-graph": "No module graph was given (--graph, from `impact-check graph`): components, import-based relationships and vendor SDK imports were not analyzed.",
    "graph-path-mismatch": "Module paths in the graph do not exist under --cwd; the graph may come from another root or revision.",
    "component-graph-language-unsupported": "These container sources contain code in languages the module graph does not cover (JS/TS only in 0.1); their components and imports were not analyzed.",
    "helm-not-rendered": "Helm charts are not rendered; nothing under these charts was analyzed.",
    "kustomize-not-rendered": "Kustomize overlays are not applied; plain resources beside a kustomization were read as written.",
    "iac-not-evaluated": "Terraform, OpenTofu, Pulumi and CDK files are not evaluated.",
    "yaml-unparseable": "These YAML/JSON files could not be parsed and contributed nothing.",
    "symlink-skipped": "Symbolic links are never followed.",
    "gitignored-skipped": "Paths ignored by .gitignore or .git/info/exclude were not walked (set respect_gitignore to false to include them).",
    "file-too-large": "Files over 1 MiB are not parsed.",
    "file-not-utf8": "Files that are not valid UTF-8 are not parsed.",
    "file-list-cap": "The repository walk stopped at 20,000 entries or depth 20; later files were not analyzed.",
    "path-outside-root": "A build context or reference points outside the repository root and was ignored.",
    "dsl-include-not-followed": "Local `!include` directives in the Structurizr DSL are not followed; elements they define are missing from the declared model.",
    "dsl-statement-ignored": "Structurizr DSL statements outside the supported subset were skipped (see docs/SPEC.md §3.6).",
    "dsl-deployment-ignored": "Structurizr deployment environments are not compared in 0.1.",
    "calm-unsupported": "CALM content outside the supported mapping (flows, controls, options, interfaces) was not compared.",
    "findings-cap": "More than 5,000 findings; the rest were dropped.",
    "static-analysis-only": "Only static evidence is used: runtime calls, service discovery and deploy-time configuration are invisible. Missing evidence is reported as unknown, never as absence.",
};
/** Collects limitation occurrences during a run. */
export class Limitations {
    entries = new Map();
    /** Records one occurrence, optionally with a path. */
    add(code, path) {
        const entry = this.entries.get(code) ?? { count: 0, paths: [] };
        entry.count += 1;
        if (path !== undefined)
            entry.paths.push(path);
        this.entries.set(code, entry);
    }
    /** True when a code was recorded. */
    has(code) {
        return this.entries.has(code);
    }
    /** Sorted list for the report (`static-analysis-only` is always present). */
    list() {
        const all = new Map(this.entries);
        if (!all.has("static-analysis-only"))
            all.set("static-analysis-only", { count: 1, paths: [] });
        return [...all.keys()].sort().map((code) => {
            const entry = all.get(code);
            return {
                code,
                message: LIMITATION_MESSAGES[code] ?? code,
                count: entry.count,
                paths: uniqueSorted(entry.paths).slice(0, 50),
            };
        });
    }
}
