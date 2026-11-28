import type { DependencyPlan } from "./deps.type.js";

/** Problems with the current state of the workspace against the catalog rule, as human-readable lines. */
export function checkDeps(p: DependencyPlan): string[] {
	const problems: string[] = [];
	const referenced = new Set<string>();
	for (const row of p.rows) {
		if (!row.catalog) continue;
		for (const e of row.edges) {
			if (e.spec.startsWith("catalog:")) referenced.add(`${e.spec.slice(8) || "default"}|${row.name}`);
			// a peer range is not a catalog entry (the plugins' peer floors are the one exception, and they are
			// checked as catalog references like any other)
			if (e.section === "peerDependencies" && !e.spec.startsWith("catalog:")) continue;
			const expected = row.catalog === "default" ? "catalog:" : `catalog:${row.catalog}`;
			if (!e.spec.startsWith("catalog:")) {
				problems.push(
					`${e.file}: ${e.section}.${row.name} is "${e.spec}"; use "${expected}" (${row.catalog} catalog)`
				);
			} else if (e.spec !== expected && e.spec !== "catalog:default") {
				problems.push(`${e.file}: ${e.section}.${row.name} is "${e.spec}"; it belongs in ${expected}`);
			}
		}
	}
	for (const [catalog, entries] of Object.entries(p.catalogs)) {
		for (const name of Object.keys(entries)) {
			if (!referenced.has(`${catalog}|${name}`))
				problems.push(`pnpm-workspace.yaml: ${catalog} catalog entry "${name}" is not used`);
		}
	}
	return [...problems, ...p.flags];
}
