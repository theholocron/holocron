import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CATALOG_SECTIONS } from "./constants.js";
import type { DependencyEdge, DependencySection } from "./deps.type.js";
import { groupOf } from "./group-of.js";

/**
 * Every dependency edge in the workspace: one per manifest entry that is not a `workspace:` link. The root manifest's
 * `link:` entries for workspace packages are left out too: turbo gives the root an edge to every package that has no
 * internal dependency, so a `workspace:` entry there makes every package affected by a change to any of them (#2407).
 */
export function collectEdges(root: string, dirs: string[]): { edges: DependencyEdge[]; inRepo: Set<string> } {
	const edges: DependencyEdge[] = [];
	const inRepo = new Set<string>();
	const manifests = dirs.map((dir) => {
		const json = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8")) as Record<string, unknown> & {
			name?: string;
		};
		if (json.name) inRepo.add(json.name);
		return { dir, file: dir === "" ? "package.json" : `${dir}/package.json`, json };
	});
	const sections: DependencySection[] = [...CATALOG_SECTIONS, "peerDependencies"];
	for (const { dir, file, json } of manifests) {
		for (const section of sections) {
			const entries = (json[section] ?? {}) as Record<string, unknown>;
			for (const [name, spec] of Object.entries(entries)) {
				const range = String(spec);
				if (range.startsWith("workspace:")) continue;
				if (dir === "" && range.startsWith("link:") && inRepo.has(name)) continue;
				edges.push({ name, spec: range, section, pkg: json.name ?? "(root)", dir, group: groupOf(dir), file });
			}
		}
	}
	return { edges, inRepo };
}
