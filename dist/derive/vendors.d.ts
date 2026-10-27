/**
 * Vendor SDK table: npm packages whose import means the code talks to a third-party system. Extendable with the
 * `external_sdks` config key. Matching is by exact package name or a `prefix/*` pattern.
 */
/** Built-in package patterns → vendor display name. */
export declare const VENDOR_SDKS: Readonly<Record<string, string>>;
/** Package name of an import specifier (`@scope/name` or `name`), or null for relative/absolute specifiers. */
export declare function packageOf(specifier: string): string | null;
/** True when a package matches a pattern (exact, or `prefix/*`). */
export declare function packageMatches(pkg: string, pattern: string): boolean;
/** Vendor of a package, consulting the config table first, or null. */
export declare function vendorOf(pkg: string, extra: Readonly<Record<string, string>>): string | null;
