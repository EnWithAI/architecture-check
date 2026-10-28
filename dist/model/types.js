/** Splits a property value list (`a, b` in DSL; string or array in CALM). */
export function propertyList(value) {
    if (typeof value === "string")
        return value
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
    if (Array.isArray(value))
        return value.filter((v) => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
    return [];
}
/** True for `true` or `"true"` (any case). */
export function propertyTrue(value) {
    return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}
