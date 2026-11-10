import type { Config } from "../config.js";
import type { ModuleGraph } from "../input/inputs.js";
import { type RepoFiles } from "../input/walk.js";
import type { Limitations } from "../limitations.js";
import type { ApiInterface, AsBuiltElement, AsBuiltRelationship, Evidence } from "../types.js";
/** The as-built model plus lookups used by the drift rules. */
export interface AsBuilt {
    elements: AsBuiltElement[];
    relationships: AsBuiltRelationship[];
    interfaces: ApiInterface[];
    byId: Map<string, AsBuiltElement>;
    technologyEvidence: Map<string, Evidence>;
}
/** Sorts evidence by path, then line. */
export declare function sortEvidence(evidence: Evidence[]): Evidence[];
/** Builds the as-built model. `extraSources` are declared source directories with no deployment descriptor. */
export declare function buildAsBuilt(root: string, files: RepoFiles, config: Config, graph: ModuleGraph | null, extraSources: readonly string[], limitations: Limitations): AsBuilt;
