import type { Config } from "./config.js";
import type { Report } from "./types.js";
/** Options of one run. */
export interface AnalyzeOptions {
    cwd: string;
    command: "derive" | "analyze" | "check";
    config: Config;
    modelPath?: string | null;
    graphPath?: string | null;
    impactCheckPath?: string | null;
    now?: () => Date;
}
/** Runs derive, analyze or check and returns the report. */
export declare function analyze(options: AnalyzeOptions): Report;
