/** The `catalog:` and `catalogs:` of a `pnpm-workspace.yaml`: the default one under `default`, the named ones under their names. */
export type Catalogs = Record<string, Record<string, string>>;

/** The `packages:` key of a `pnpm-workspace.yaml`, as a line. */
export const PACKAGES_KEY = /^packages:\s*(#.*)?$/;

/** What an edit of a `pnpm-workspace.yaml` gives back: the new text, and whether it differs from what was passed in. */
export interface WorkspaceYamlEdit {
	/** The file's text after the edit; the text passed in when nothing changed. */
	content: string;
	/** Whether `content` differs from the text passed in. */
	changed: boolean;
}

/** A catalog pin rewritten by {@link bumpCatalogPins}. */
export interface CatalogBump {
	/** The package whose pin was rewritten. */
	pkg: string;
	/** The version it was pinned to. */
	from: string;
	/** The version it is pinned to now. */
	to: string;
}

/** Resolves a package's latest published version, or `null` when there is no answer. */
export type FetchLatest = (pkg: string) => Promise<string | null>;

/** What {@link bumpCatalogPins} may be told. */
export interface BumpCatalogPinsOptions {
	/** Which pinned packages to look up. Default: all of them. */
	include?: (pkg: string) => boolean;
}

/**
 * Parse the `catalog:` and `catalogs:` blocks of `pnpm-workspace.yaml` (the generated, flat format), as
 * `{ default: {...}, <name>: {...} }` of package name to range. Entries outside a catalog are ignored.
 */
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

/**
 * Add `member` as the first entry of the `packages:` list, unless the list already has it. A targeted
 * line-based edit, not a YAML round-trip: the file routinely carries a `catalog:`/`catalogs:`/`overrides:`
 * block after `packages:`, and a parser would reformat content nobody asked to touch. It only ever adds a
 * line, quoted like `"docs"`, and changes nothing when there is no `packages:` key or it is not the plain
 * block-list form.
 */
export function addWorkspaceMember(workspaceYaml: string, member: string): WorkspaceYamlEdit {
	const lines = workspaceYaml.split("\n");
	const packagesLineIdx = lines.findIndex((l) => PACKAGES_KEY.test(l));
	if (packagesLineIdx === -1) return { content: workspaceYaml, changed: false };

	const items: string[] = [];
	let cursor = packagesLineIdx + 1;
	while (cursor < lines.length && /^\s*-\s*/.test(lines[cursor]!)) {
		items.push(lines[cursor]!);
		cursor++;
	}

	const alreadyIncluded = items.some((item) => {
		const value = item
			.replace(/^\s*-\s*/, "")
			.replace(/^["']|["']$/g, "")
			.trim();
		return value === member || (member === "." && value === "");
	});
	if (alreadyIncluded) return { content: workspaceYaml, changed: false };

	const indent = items[0]?.match(/^(\s*-\s*)/)?.[1] ?? "  - ";
	const newLines = [
		...lines.slice(0, packagesLineIdx + 1),
		`${indent}"${member}"`,
		...lines.slice(packagesLineIdx + 1),
	];
	return { content: newLines.join("\n"), changed: true };
}

/** `a > b` for `x.y.z` release versions (prerelease tags are ignored). */
export function gt(a: string, b: string): boolean {
	const pa = a.split(".").map((n) => parseInt(n, 10));
	const pb = b.split(".").map((n) => parseInt(n, 10));
	for (let i = 0; i < 3; i++) {
		const x = pa[i] ?? 0;
		const y = pb[i] ?? 0;
		if (x !== y) return x > y;
	}
	return false;
}

const CATALOG_LINE =
	/^(\s*['"]?)((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)(['"]?\s*:\s*['"]?)([~^]?)(\d+\.\d+\.\d+[\w.-]*)(['"]?\s*)$/;

/**
 * Rewrite the pins of the `catalog:` and every named `catalogs.*` entry to the latest published version,
 * keeping the range prefix (`^`, `~`) and the quoting. `options.include` limits which
 * packages are looked up. Never downgrades; a package with no answer from `fetchLatest` is left
 * alone. `fetchLatest` is called once per package.
 */
export async function bumpCatalogPins(
	content: string,
	fetchLatest: FetchLatest,
	options: BumpCatalogPinsOptions = {}
): Promise<{ content: string; bumps: CatalogBump[] }> {
	const include = options.include ?? (() => true);
	const lines = content.split("\n");
	const wanted = new Set<string>();
	for (const line of lines) {
		const m = CATALOG_LINE.exec(line);
		if (m && include(m[2]!)) wanted.add(m[2]!);
	}

	const latest = new Map<string, string | null>();
	await Promise.all(
		[...wanted].map(async (pkg) => {
			latest.set(pkg, await fetchLatest(pkg));
		})
	);

	const bumps: CatalogBump[] = [];
	const out = lines.map((line) => {
		const m = CATALOG_LINE.exec(line);
		if (!m) return line;
		const [, pre, pkg, mid, prefix, current, post] = m;
		const next = latest.get(pkg!);
		if (!next || next === current || !gt(next, current!)) return line;
		bumps.push({ pkg: pkg!, from: current!, to: next });
		return `${pre}${pkg}${mid}${prefix}${next}${post}`;
	});

	return { content: out.join("\n"), bumps };
}
