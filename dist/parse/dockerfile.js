// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 EnWithAI Technologies
/**
 * Dockerfile reader: only `FROM` instructions (with line continuations, `--platform` flags and `AS` aliases). The
 * final stage's image is resolved through earlier stage aliases. Nothing else is interpreted.
 */
/** Reads the final stage image of a Dockerfile; image is null when there is no FROM or it is variable. */
export function readDockerfile(text) {
    const stages = [];
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const start = i;
        let instruction = lines[i];
        while (/\\\s*$/.test(instruction) && i + 1 < lines.length) {
            instruction = instruction.replace(/\\\s*$/, " ") + lines[++i];
        }
        const trimmed = instruction.trim();
        if (!/^from\s/i.test(trimmed))
            continue;
        const words = trimmed
            .split(/\s+/)
            .slice(1)
            .filter((w) => !w.startsWith("--"));
        const image = words[0];
        if (image === undefined)
            continue;
        const asIndex = words.findIndex((w) => w.toLowerCase() === "as");
        const alias = asIndex > 0 ? (words[asIndex + 1] ?? null) : null;
        stages.push({ image, alias: alias === null ? null : alias.toLowerCase(), line: start + 1 });
    }
    const last = stages[stages.length - 1];
    if (last === undefined)
        return { image: null, line: 1 };
    let image = last.image;
    for (let hops = 0; hops < stages.length && image !== null; hops++) {
        const ref = image.toLowerCase();
        const stage = stages.find((s) => s.alias === ref);
        if (stage === undefined)
            break;
        if (stage.image === image)
            break;
        image = stage.image;
    }
    return { image, line: last.line };
}
