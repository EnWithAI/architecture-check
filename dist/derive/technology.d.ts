/**
 * Technology families: container image references → family, and declared technology text → families. Used for the
 * as-built technology and for `technology-mismatch` (a hypothesis: multi-stage builds and sidecars blur it).
 */
/** The technology family of an image reference, or null when unknown or variable. */
export declare function familyOfImage(image: string): string | null;
/** True when the family is a data store (CALM node type `database`). */
export declare function isDatastore(family: string | null): boolean;
/** Families named in a declared technology text (token match, so "Django" does not match "Go"). */
export declare function familiesOfText(text: string): string[];
