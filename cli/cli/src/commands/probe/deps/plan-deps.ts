import { readFileSync } from "node:fs";
import { join } from "node:path";

import { collectEdges } from "./collect-edges.js";
import { SCOPE } from "./constants.js";
import type { Catalogs, DependencyEdge, DependencyPlan, DependencyRow } from "./deps.type.js";
import { parseCatalogs } from "./parse-catalogs.js";
import { pickRange } from "./pick-range.js";
import { targetCatalog } from "./target-catalog.js";
import { workspaceDirs } from "./workspace-dirs.js";

function resolveSpec(spec: string, name: string, catalogs: Catalogs): string | undefined {
	if (!spec.startsWith("catalog:")) return spec;
	return catalogs[spec.slice("catalog:".length) || "default"]?.[name];
}

/**
 * Reads every workspace manifest and `pnpm-workspace.yaml` live and works out, for every dependency, the catalog it
 * belongs in and its range, plus the entries that need a human look.
 */
export function planDeps(root: string): DependencyPlan {
	const yamlText = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
	const catalogs = parseCatalogs(yamlText);
	const dirs = workspaceDirs(root, yamlText);
	const { edges, inRepo } = collectEdges(root, dirs);

	const byName = new Map<string, { name: string; edges: DependencyEdge[]; groups: Set<string> }>();
	const flags: string[] = [];
	for (const edge of edges) {
		if (inRepo.has(edge.name) && !edge.spec.startsWith("catalog:")) {
			// a package that is in this workspace is linked with workspace:, not a version from npm; a peer
			// range is the exception, it is a compatibility range for consumers
			if (edge.section !== "peerDependencies") {
				flags.push(
					`${edge.file}: ${edge.section}.${edge.name} is "${edge.spec}", but it is a workspace package; use "workspace:^"`
				);
			}
			continue;
		}
		const entry = byName.get(edge.name) ?? { name: edge.name, edges: [], groups: new Set<string>() };
		entry.edges.push(edge);
		if (edge.section !== "peerDependencies") entry.groups.add(edge.group);
		byName.set(edge.name, entry);
	}

	const wanted: DependencyPlan["wanted"] = {};
	const rows: DependencyRow[] = [];
	for (const entry of [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))) {
		const isScoped = entry.name.startsWith(SCOPE);
		const nonPeer = entry.edges.filter((e) => e.section !== "peerDependencies");
		const peers = entry.edges.filter((e) => e.section === "peerDependencies");

		let target: string;
		if (isScoped) {
			// our own packages that are resolved from a catalog: a published copy on purpose
			target = nonPeer.length > 0 ? "published" : "peers";
		} else if (nonPeer.length === 0) {
			// peer-only: keeps its compatibility range, not in any catalog
			rows.push({ name: entry.name, catalog: null, range: null, groups: [], edges: entry.edges });
			continue;
		} else {
			target = targetCatalog(entry.groups);
		}

		const usedFrom = isScoped && nonPeer.length === 0 ? peers : nonPeer;
		const ranges: string[] = [];
		for (const e of usedFrom) {
			const range = resolveSpec(e.spec, e.name, catalogs);
			if (range === undefined) flags.push(`${e.file}: ${entry.name} -> ${e.spec} has no catalog entry`);
			else ranges.push(range);
		}
		const current =
			catalogs[target]?.[entry.name] ?? (target === "default" ? undefined : catalogs["default"]?.[entry.name]);
		const { range, majorConflict, unparsed } = pickRange(ranges, current);
		if (majorConflict)
			flags.push(`${entry.name}: ranges disagree on the major version: ${[...new Set(ranges)].join(" | ")}`);
		if (unparsed) flags.push(`${entry.name}: a range is not plain semver: ${[...new Set(ranges)].join(" | ")}`);

		(wanted[target] ??= {})[entry.name] = range;
		rows.push({ name: entry.name, catalog: target, range, groups: [...entry.groups].sort(), edges: entry.edges });
	}
	return { root, dirs, catalogs, wanted, rows, flags };
}
