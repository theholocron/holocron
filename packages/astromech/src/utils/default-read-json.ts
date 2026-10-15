import { readFileSync } from "node:fs";

export const defaultReadJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8")) as unknown;
