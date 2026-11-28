import { readFileSync } from "node:fs";

/** Reads and parses the JSON file at `path`. */
export const defaultReadJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8")) as unknown;
