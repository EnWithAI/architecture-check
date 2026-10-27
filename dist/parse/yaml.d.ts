/** A parsed YAML document. */
export interface YamlDoc {
    value: unknown;
    lines: Map<string, number>;
}
/** JSON pointer segment escaping (RFC 6901). */
export declare function pointerSegment(key: string): string;
/** Parses every document in a YAML (or JSON) text; null when any document has an error. */
export declare function parseYaml(text: string): YamlDoc[] | null;
/** Plain-object check for parsed YAML values. */
export declare function isObject(value: unknown): value is Record<string, unknown>;
/** Line for a pointer, falling back to its closest recorded ancestor, then 1. */
export declare function lineOf(doc: YamlDoc, pointer: string): number;
