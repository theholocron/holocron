import type { Catalogs } from "./deps.type.js";

/** Parse the `catalog:` and `catalogs:` blocks of `pnpm-workspace.yaml` (the generated, flat format). */
export function parseCatalogs(text: string): Catalogs {
	const catalogs: Catalogs = { default: {} };
	let current: string | null = null;
	let inCatalogs = false;
	for (const raw of text.split("\n")) {
		if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;
		if (/^catalog:\s*$/.test(raw)) {
			current = "default";
			inCatalogs = false;
			continue;
		}
		if (/^catalogs:\s*$/.test(raw)) {
			current = null;
			inCatalogs = true;
			continue;
		}
		if (/^\S/.test(raw)) {
			current = null;
			inCatalogs = false;
			continue;
		}
		const named = inCatalogs ? raw.match(/^ {2}([A-Za-z0-9_-]+):\s*$/) : null;
		if (named?.[1]) {
			current = named[1];
			catalogs[current] ??= {};
			continue;
		}
		const entry = raw.match(/^\s+("[^"]+"|[^\s:][^:]*?):\s*(.+?)\s*$/);
		if (entry?.[1] && entry[2] && current) {
			(catalogs[current] ??= {})[entry[1].replace(/^"|"$/g, "")] = entry[2].replace(/^"|"$/g, "");
		}
	}
	return catalogs;
}
