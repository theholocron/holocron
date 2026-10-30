#!/usr/bin/env node
/**
 * Who uses which dependency, and where its version lives.
 *
 * Every `dependencies`, `devDependencies` and `optionalDependencies` entry in a workspace
 * manifest takes its version from a catalog in `pnpm-workspace.yaml`, by one rule:
 *
 * - a dependency used by two or more groups (a top-level folder: `cli`, `clients`, `configs`,
 *   `plugins`, ...) lives in the default `catalog:`;
 * - a dependency used by one group lives in that group's named catalog (`catalog:configs`);
 * - `peerDependencies` stay out of catalogs: a peer range is a compatibility range for
 *   consumers, and `catalog:` would publish one pinned version in its place;
 * - a package that is in this workspace is linked with `workspace:^`, never a catalog; the plugins'
 *   minimum client and util versions live in `peers`.
 *
 * Usage:
 *   node scripts/deps-report.mjs                 # markdown report: every dependency and its users
 *   node scripts/deps-report.mjs --who vitest    # only the dependencies whose name contains "vitest"
 *   node scripts/deps-report.mjs --json          # the same data as JSON
 *   node scripts/deps-report.mjs --check         # exit 1 if a dependency breaks the rule
 *
 * Only Node built-ins are used, like the other scripts in this folder.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Sections whose versions come from a catalog. Peers keep their own compatibility ranges. */
export const CATALOG_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"];

/** Catalogs that are not a group's own dependencies. */
export const SPECIAL_CATALOGS = ["peers"];

const SCOPE = "@theholocron/";

/** Parse the `catalog:` and `catalogs:` blocks of `pnpm-workspace.yaml` (the generated, flat format). */
export function parseCatalogs(text) {
	const catalogs = { default: {} };
	let current = null;
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
		if (named) {
			current = named[1];
			catalogs[current] ??= {};
			continue;
		}
		const entry = raw.match(/^\s+("[^"]+"|[^\s:][^:]*?):\s*(.+?)\s*$/);
		if (entry && current) {
			const name = entry[1].replace(/^"|"$/g, "");
			catalogs[current][name] = entry[2].replace(/^"|"$/g, "");
		}
	}
	return catalogs;
}

/** The workspace package folders, from the `packages:` globs (`dir` or `dir/*`), plus the root. */
export function workspaceDirs(root, yamlText) {
	const globs = [...yamlText.matchAll(/^\s+-\s+"?([^"\n]+?)"?\s*$/gm)]
		.map((m) => m[1])
		.filter((g) => !g.startsWith("!"));
	const packagesBlock = yamlText.split(/^packages:\s*$/m)[1]?.split(/^\S/m)[0] ?? "";
	const dirs = [""];
	for (const line of packagesBlock.split("\n")) {
		const glob = line.match(/^\s+-\s+"?([^"\n]+?)"?\s*$/)?.[1];
		if (!glob || !globs.includes(glob)) continue;
		if (glob.endsWith("/*")) {
			const base = glob.slice(0, -2);
			if (!existsSync(join(root, base))) continue;
			for (const entry of readdirSync(join(root, base), { withFileTypes: true })) {
				if (entry.isDirectory() && existsSync(join(root, base, entry.name, "package.json"))) {
					dirs.push(`${base}/${entry.name}`);
				}
			}
		} else if (existsSync(join(root, glob, "package.json"))) {
			dirs.push(glob);
		}
	}
	return dirs;
}

/** The group of a workspace folder: its top-level directory, or `root`. */
export function groupOf(dir) {
	return dir === "" ? "root" : dir.split("/")[0];
}

/** Every dependency edge in the workspace: one per manifest entry that is not a `workspace:` link. */
export function collectEdges(root, dirs) {
	const edges = [];
	const inRepo = new Set();
	const manifests = dirs.map((dir) => {
		const file = join(root, dir, "package.json");
		const json = JSON.parse(readFileSync(file, "utf8"));
		if (json.name) inRepo.add(json.name);
		return { dir, file: dir === "" ? "package.json" : `${dir}/package.json`, json };
	});
	for (const { dir, file, json } of manifests) {
		for (const section of [...CATALOG_SECTIONS, "peerDependencies"]) {
			for (const [name, spec] of Object.entries(json[section] ?? {})) {
				const range = String(spec);
				if (range.startsWith("workspace:")) continue;
				edges.push({ name, spec: range, section, pkg: json.name ?? "(root)", dir, group: groupOf(dir), file });
			}
		}
	}
	return { edges, inRepo };
}

/** `^1.2.3`, `~1.2.3`, `1.2.3`, `>=1.2.3` -> [1, 2, 3]; null for anything else. */
function minVersion(range) {
	const m = range.match(/^[\^~>=\s]*(\d+)\.(\d+)\.(\d+)/) ?? range.match(/^[\^~>=\s]*(\d+)(?:\.(\d+))?(?:\.x)?\s*$/);
	return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

function compare(a, b) {
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
	return 0;
}

/** The highest of several ranges by minimum version, and whether they disagree on the major. */
export function pickRange(ranges, preferred) {
	const unique = [...new Set(ranges)];
	if (preferred && unique.includes(preferred)) return { range: preferred, majorConflict: majorsDiffer(unique) };
	const parsed = unique.map((r) => ({ r, v: minVersion(r) }));
	if (parsed.some((p) => !p.v)) return { range: unique[0], majorConflict: unique.length > 1, unparsed: true };
	parsed.sort((a, b) => compare(b.v, a.v));
	return { range: parsed[0].r, majorConflict: majorsDiffer(unique) };
}

function majorsDiffer(ranges) {
	return new Set(ranges.map((r) => minVersion(r)?.[0])).size > 1;
}

/** Where a third-party dependency belongs, from the groups that use it (peers do not count). */
export function targetCatalog(groups) {
	const real = [...groups].filter((g) => g !== "root");
	if (groups.size > 1 && real.length !== 1) return "default";
	if (real.length === 1 && groups.size === 1) return real[0];
	return "default";
}

/** Resolve an edge's spec to a concrete range through the catalogs. */
function resolveSpec(spec, name, catalogs) {
	if (!spec.startsWith("catalog:")) return { range: spec, catalog: null };
	const catalog = spec.slice("catalog:".length) || "default";
	return { range: catalogs[catalog]?.[name], catalog };
}

/**
 * The plan: for every dependency, the catalog it belongs in and its range; for every edge, the spec
 * it should have; and the entries that need a human look.
 */
export function plan(root = fileURLToPath(new URL("..", import.meta.url))) {
	const yamlText = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
	const catalogs = parseCatalogs(yamlText);
	const dirs = workspaceDirs(root, yamlText);
	const { edges, inRepo } = collectEdges(root, dirs);

	const byName = new Map();
	const flags = [];
	for (const edge of edges) {
		if (inRepo.has(edge.name) && edge.section !== "peerDependencies") {
			// a package that is in this workspace is linked with workspace:, not a version from npm or a
			// catalog; a peer range is the exception, it is a compatibility range for consumers
			if (!edge.spec.startsWith("workspace:")) {
				flags.push(
					`${edge.file}: ${edge.section}.${edge.name} is "${edge.spec}", but it is a workspace package; use "workspace:^"`
				);
			}
			continue;
		}
		const entry = byName.get(edge.name) ?? { name: edge.name, edges: [], groups: new Set() };
		entry.edges.push(edge);
		if (edge.section !== "peerDependencies") entry.groups.add(edge.group);
		byName.set(edge.name, entry);
	}

	const wanted = {}; // catalog -> name -> range
	const edgeSpecs = []; // edge -> new spec
	const rows = [];
	for (const entry of [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))) {
		const isScoped = entry.name.startsWith(SCOPE);
		const nonPeer = entry.edges.filter((e) => e.section !== "peerDependencies");
		const peers = entry.edges.filter((e) => e.section === "peerDependencies");

		let target;
		if (isScoped && nonPeer.length === 0) {
			// our own package that is only a peer: the plugins' minimum version of it
			target = "peers";
		} else if (nonPeer.length === 0) {
			// peer-only: keeps its compatibility range, not in any catalog
			rows.push({ name: entry.name, catalog: null, range: null, groups: [], edges: entry.edges });
			continue;
		} else {
			target = targetCatalog(entry.groups);
		}

		const usedFrom = isScoped && nonPeer.length === 0 ? peers : nonPeer;
		const resolved = usedFrom.map((e) => ({ edge: e, ...resolveSpec(e.spec, e.name, catalogs) }));
		const missing = resolved.filter((r) => r.range === undefined);
		for (const m of missing) flags.push(`${m.edge.file}: ${entry.name} -> ${m.edge.spec} has no catalog entry`);
		const ranges = resolved.map((r) => r.range).filter((r) => r !== undefined);
		const current =
			catalogs[target]?.[entry.name] ?? (target === "default" ? undefined : catalogs.default?.[entry.name]);
		const { range, majorConflict, unparsed } = pickRange(ranges, current);
		if (majorConflict)
			flags.push(`${entry.name}: ranges disagree on the major version: ${[...new Set(ranges)].join(" | ")}`);
		if (unparsed) flags.push(`${entry.name}: a range is not plain semver: ${[...new Set(ranges)].join(" | ")}`);

		(wanted[target] ??= {})[entry.name] = range;
		const spec = target === "default" ? "catalog:" : `catalog:${target}`;
		for (const e of usedFrom) edgeSpecs.push({ ...e, from: e.spec, to: spec });
		rows.push({ name: entry.name, catalog: target, range, groups: [...entry.groups].sort(), edges: entry.edges });
	}
	return { root, dirs, catalogs, wanted, edgeSpecs: edgeSpecs.filter((e) => e.from !== e.to), rows, flags };
}

/** Problems with the current state, as human-readable lines. */
export function check(p) {
	const problems = [];
	for (const row of p.rows) {
		if (!row.catalog) continue;
		for (const e of row.edges) {
			// a peer range is not a catalog entry (the plugins' peer floors are the one exception, and they are
			// checked below as catalog references like any other)
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
	const referenced = new Set();
	for (const row of p.rows) {
		if (!row.catalog) continue;
		for (const e of row.edges) {
			if (e.spec.startsWith("catalog:")) referenced.add(`${e.spec.slice(8) || "default"}|${row.name}`);
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

function usersOf(row) {
	const byPkg = new Map();
	for (const e of row.edges) {
		const kind = e.section === "peerDependencies" ? "peer" : e.section === "devDependencies" ? "dev" : "prod";
		const kinds = byPkg.get(e.pkg) ?? new Set();
		kinds.add(kind);
		byPkg.set(e.pkg, kinds);
	}
	return [...byPkg.entries()].map(([pkg, kinds]) => ({ pkg, kinds: [...kinds] }));
}

/** One section per dependency matching `filter`: where its version lives and every package that uses it. */
function detail(p, filter) {
	const rows = p.rows.filter((r) => r.name.includes(filter));
	if (rows.length === 0) return `No dependency matches "${filter}".\n`;
	const lines = [];
	const short = (pkg) => pkg.replace(SCOPE, "");
	for (const r of rows) {
		const where =
			r.catalog === null
				? "peer ranges only (not in a catalog)"
				: r.catalog === "default"
					? "catalog: (default)"
					: `catalog:${r.catalog}`;
		lines.push(`### ${r.name}${r.range ? ` ${r.range}` : ""}  (${where})`, "");
		const byGroup = new Map();
		for (const e of r.edges) {
			const entry = byGroup.get(e.group) ?? new Map();
			const kinds = entry.get(e.pkg) ?? new Set();
			kinds.add(e.section === "peerDependencies" ? "peer" : e.section === "devDependencies" ? "dev" : "prod");
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

/** The markdown report, grouped by catalog; with `filter`, the users of the matching dependencies. */
export function report(p, filter) {
	if (filter) return detail(p, filter);
	const match = () => true;
	const lines = ["# Dependencies", ""];
	const order = [
		"default",
		...Object.keys(p.wanted)
			.filter((c) => c !== "default" && !SPECIAL_CATALOGS.includes(c))
			.sort(),
		...SPECIAL_CATALOGS,
	];
	const titles = {
		default: "Shared (default `catalog:`)",
		peers: "Peer floors (minimum versions the plugins accept)",
	};
	for (const catalog of order) {
		const rows = p.rows.filter((r) => r.catalog === catalog && match(r.name));
		if (rows.length === 0) continue;
		const spec = catalog === "default" ? "catalog:" : `catalog:${catalog}`;
		lines.push(
			`## ${titles[catalog] ?? `${catalog} (\`${spec}\`)`}`,
			"",
			"| Dependency | Range | Used by |",
			"| --- | --- | --- |"
		);
		for (const r of rows) {
			// the names are in `--who <dependency>`; here only how widely it is used
			const groups = [...new Set(r.edges.map((e) => e.group))].sort();
			lines.push(`| \`${r.name}\` | \`${r.range}\` | ${usersOf(r).length} in ${groups.join(", ")} |`);
		}
		lines.push("");
	}
	const peerOnly = p.rows.filter((r) => r.catalog === null && match(r.name));
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

function main(argv) {
	const p = plan();
	if (argv.includes("--check")) {
		const problems = check(p);
		if (problems.length === 0) {
			console.log(
				`deps-report: ${p.rows.filter((r) => r.catalog).length} dependencies, all in the right catalog`
			);
			return 0;
		}
		for (const line of problems) console.error(`  ERROR  ${line}`);
		console.error(`\ndeps-report: ${problems.length} problem(s)`);
		return 1;
	}
	if (argv.includes("--json")) {
		console.log(
			JSON.stringify(
				p.rows.map((r) => ({
					name: r.name,
					catalog: r.catalog,
					range: r.range,
					groups: r.groups,
					users: usersOf(r),
				})),
				null,
				2
			)
		);
		return 0;
	}
	const who = argv.indexOf("--who");
	console.log(report(p, who >= 0 ? argv[who + 1] : undefined));
	return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
