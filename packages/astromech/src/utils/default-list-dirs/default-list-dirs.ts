import { readdirSync } from "node:fs";

export const defaultListDirs = (path: string): string[] =>
	readdirSync(path, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
