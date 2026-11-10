/** Serializes a report as stable, pretty-printed JSON. */
export function renderJson(report) {
    return `${JSON.stringify(report, null, 2)}\n`;
}
