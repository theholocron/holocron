import { SCOPE, SPECIAL_CATALOGS } from "./constants.js";
import type { DependencyPlan, DependencyRow, DependencyUser } from "./deps.type.js";

const kindOf = (section: string): string =>
	section === "peerDependencies" ? "peer" : section === "devDependencies" ? "dev" : "prod";

/** Every package that uses a dependency, with how. */
export function usersOf(row: DependencyRow): DependencyUser[] {
	const byPkg = new Map<string, Set<string>>();
	for (const e of row.edges) {
		const kinds = byPkg.get(e.pkg) ?? new Set<string>();
		kinds.add(kindOf(e.section));
		byPkg.set(e.pkg, kinds);
	}
	return [...byPkg.entries()].map(([pkg, kinds]) => ({ pkg, kinds: [...kinds] }));
}

/** One section per dependency matching `filter`: where its version lives and every package that uses it. */
function detail(p: DependencyPlan, filter: string): string {
	const rows = p.rows.filter((r) => r.name.includes(filter));
	if (rows.length === 0) return `No dependency matches "${filter}".\n`;
	const lines: string[] = [];
	const short = (pkg: string): string => pkg.replace(SCOPE, "");
	for (const r of rows) {
		const where =
			r.catalog === null
				? "peer ranges only (not in a catalog)"
				: r.catalog === "default"
					? "catalog: (default)"
					: `catalog:${r.catalog}`;
		lines.push(`### ${r.name}${r.range ? ` ${r.range}` : ""}  (${where})`, "");
		const byGroup = new Map<string, Map<string, Set<string>>>();
		for (const e of r.edges) {
			const entry = byGroup.get(e.group) ?? new Map<string, Set<string>>();
			const kinds = entry.get(e.pkg) ?? new Set<string>();
			kinds.add(kindOf(e.section));
			entry.set(e.pkg, kinds);
			byGroup.set(e.group, entry);
		}
		for (const [group, pkgs] of [...byGroup].sort((a, b) => a[0].localeCompare(b[0]))) {
			const list = [...pkgs].map(([pkg, kinds]) => `${short(pkg)} (${[...kinds].join("+")})`).join(", ");
			lines.push(`- **${group}**: ${list}`);
		}
		lines.push("");
	}
	return lines.join("\n");
}

const TITLES: Record<string, string> = {
	default: "Shared (default `catalog:`)",
	peers: "Peer floors (minimum versions the plugins accept)",
};

/** The markdown report, grouped by catalog; with `filter`, the users of the matching dependencies. */
export function reportDeps(p: DependencyPlan, filter?: string): string {
	if (filter) return detail(p, filter);
	const lines = ["# Dependencies", ""];
	const special: readonly string[] = SPECIAL_CATALOGS;
	const order = [
		"default",
		...Object.keys(p.wanted)
			.filter((c) => c !== "default" && !special.includes(c))
			.sort(),
		...SPECIAL_CATALOGS,
	];
	for (const catalog of order) {
		const rows = p.rows.filter((r) => r.catalog === catalog);
		if (rows.length === 0) continue;
		const spec = catalog === "default" ? "catalog:" : `catalog:${catalog}`;
		lines.push(
			`## ${TITLES[catalog] ?? `${catalog} (\`${spec}\`)`}`,
			"",
			"| Dependency | Range | Used by |",
			"| --- | --- | --- |"
		);
		for (const r of rows) {
			// the names are in `who <dependency>`; here only how widely it is used
			const groups = [...new Set(r.edges.map((e) => e.group))].sort();
			lines.push(`| \`${r.name}\` | \`${r.range}\` | ${usersOf(r).length} in ${groups.join(", ")} |`);
		}
		lines.push("");
	}
	const peerOnly = p.rows.filter((r) => r.catalog === null);
	if (peerOnly.length > 0) {
		lines.push(
			"## Peer ranges only (not in a catalog)",
			"",
			"| Dependency | Ranges | Peer of |",
			"| --- | --- | --- |"
		);
		for (const r of peerOnly) {
			lines.push(
				`| \`${r.name}\` | ${[...new Set(r.edges.map((e) => `\`${e.spec}\``))].join(", ")} | ${r.edges.length} |`
			);
		}
		lines.push("");
	}
	return lines.join("\n");
}
