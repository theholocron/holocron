import { readdirSync } from "node:fs";

/** The names of the directories directly inside `path`. */
export const defaultListDirs = (path: string): string[] =>
	readdirSync(path, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
