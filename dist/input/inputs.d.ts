import type { InputInfo } from "../types.js";
/** A module of the graph. */
export interface GraphModule {
    path: string;
    kind: string;
}
/** An import edge of the graph. */
export interface GraphEdge {
    from: string;
    to: string;
    provenance: "graph" | "inferred";
    typeOnly: boolean;
    line: number | null;
}
/** An import of an npm package or Node built-in. */
export interface GraphExternalImport {
    from: string;
    specifier: string;
    line: number | null;
}
/** The parts of `impact-check graph` output that Architecture Check uses. */
export interface ModuleGraph {
    info: InputInfo;
    modules: GraphModule[];
    edges: GraphEdge[];
    externalImports: GraphExternalImport[];
    workspacePackages: {
        name: string;
        path: string;
    }[];
}
/** Reads and validates an `impact-check graph --format json` file. */
export declare function readGraph(path: string, displayPath: string): ModuleGraph;
/** The parts of an Impact Check report that Architecture Check uses. */
export interface ImpactReport {
    info: InputInfo;
    changedPaths: Set<string>;
}
/** Reads and validates an Impact Check JSON report (schema 2.0). */
export declare function readImpactReport(path: string, displayPath: string): ImpactReport;
