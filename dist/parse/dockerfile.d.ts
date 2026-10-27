/**
 * Dockerfile reader: only `FROM` instructions (with line continuations, `--platform` flags and `AS` aliases). The
 * final stage's image is resolved through earlier stage aliases. Nothing else is interpreted.
 */
/** The image a Dockerfile's final stage is built from. */
export interface DockerfileInfo {
    image: string | null;
    line: number;
}
/** Reads the final stage image of a Dockerfile; image is null when there is no FROM or it is variable. */
export declare function readDockerfile(text: string): DockerfileInfo;
