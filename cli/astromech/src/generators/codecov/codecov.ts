/**
 * `codecov.yml` generation — a manifest-derived artifact (component `paths`
 * come from workspace packages; the status targets track the `test` task's
 * coverage setup), the same category as the reusable `test.yml` this package
 * also generates. Moved out of `@theholocron/cli` (theholocron/holocron#650)
 * — `holocron repo setup`'s codecov step now calls {@link codecovConfig} instead
 * of importing this logic directly.
 */

import codecovTemplate from "../../templates/codecov/codecov.yml";
import { discoverWorkspacePackages } from "../../workspace/index.js";
import type { WorkspacePackage } from "./codecov.type.js";

export const INDIVIDUAL_COMPONENTS_MARKER = "  individual_components:";

function scaffoldHeader(): string {
	return [
		`# Scaffolded by holocron repo setup — edit this file freely.`,
		`# Source:  theholocron/holocron · cli/astromech/src/generators/codecov/codecov.ts`,
		``,
	].join("\n");
}

function location({ slug, dir, path }: WorkspacePackage): string {
	return path ?? `${dir ?? "packages"}/${slug}`;
}

export function codecovComponentBlock(packages: WorkspacePackage[]): string {
	if (packages.length === 0) return "\n    []\n";
	let group: string | undefined;
	return (
		"\n" +
		packages
			.flatMap((pkg) => {
				const where = location(pkg);
				const root = where.split("/")[0]!;
				const heading = root === group ? [] : [`    # ${root}`];
				group = root;
				return [
					...heading,
					`    - component_id: ${pkg.slug}`,
					`      name: "${pkg.slug}"`,
					`      paths:`,
					`        - ${where}/**`,
					``,
				];
			})
			.join("\n")
	);
}

/**
 * Ensure every codecov status default carries `if_not_found: success`, so an
 * infra-only PR (dep bump, config, lockfile — no coverable change) passes
 * instead of hanging forever on a required check codecov never posts.
 *
 * Injects the key on the line after each `target:` that sits inside a status
 * block (`coverage.status.*.default` or a `statuses:` list item — indent ≥ 8,
 * or ≥ 8 for a `- type:` list entry), when the immediate sibling lines do not
 * already declare it.
 */
export function ensureIfNotFound(yaml: string): string {
	const lines = yaml.split("\n");
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		out.push(line);
		const m = /^(\s{8,})target:\s+\S+\s*$/.exec(line);
		if (!m) continue;
		const indent = m[1]!;
		// Look at the sibling lines of this mapping (same indent, until it dedents).
		let alreadySet = false;
		for (let j = i + 1; j < lines.length; j++) {
			const sib = lines[j]!;
			if (sib.trim() === "") continue;
			const sibIndent = sib.match(/^\s*/)![0].length;
			if (sibIndent < indent.length) break;
			if (sibIndent === indent.length && /^\s*if_not_found\s*:/.test(sib)) {
				alreadySet = true;
				break;
			}
			if (
				sibIndent === indent.length &&
				/^\s*(- |\w)/.test(sib) &&
				!/^\s*(threshold|flags|paths|branches)\s*:/.test(sib)
			) {
				break;
			}
		}
		if (!alreadySet) out.push(`${indent}if_not_found: success`);
	}
	return out.join("\n");
}

/** Folders that never get a flag: `docs` coverage must not count toward the aggregate statuses. */
const FLAGLESS_FOLDERS = new Set(["docs"]);

/**
 * One Codecov flag per workspace group folder (the first path segment of each
 * package location: `apps`, `cli`, `configs`, ...), in package order, without
 * duplicates and without `docs`.
 */
export function codecovFlagNames(packages: WorkspacePackage[]): string[] {
	const names = packages.map((pkg) => location(pkg).split("/")[0]!).filter((root) => !FLAGLESS_FOLDERS.has(root));
	return [...new Set(names)];
}

/** `[start, end)` of a top-level key's section; trailing blank lines are not part of it. `null` when absent. */
function section(lines: string[], key: string): [number, number] | null {
	const start = lines.indexOf(`${key}:`);
	if (start === -1) return null;
	let end = lines.findIndex((line, i) => i > start && /^[A-Za-z_]/.test(line));
	if (end === -1) end = lines.length;
	while (lines[end - 1]!.trim() === "") end--;
	return [start, end];
}

/** Insert the entries of `wanted` that no existing list item names, after the list's last line (`listEnd`). */
function appendMissingItems(
	lines: string[],
	listStart: number,
	listEnd: number,
	wanted: string[],
	itemName: RegExp,
	render: (name: string) => string
): void {
	const have = new Set(lines.slice(listStart + 1, listEnd).map((line) => itemName.exec(line)?.[1]));
	lines.splice(listEnd, 0, ...wanted.filter((name) => !have.has(name)).map(render));
}

const FLAG_ENTRY = /^ {4}- name:\s*(\S+)/;
const flagEntry = (name: string) => `    - name: ${name}`;

/**
 * Ensure a top-level `flag_management:` section carries `default_rules.carryforward`
 * and one `individual_flags` entry per flag. A missing section is inserted before
 * `component_management:`; an existing one only gains the entries it lacks, so hand
 * edits (extra flags, per-flag `paths`/`statuses`, a different `carryforward`) survive.
 */
export function ensureFlagManagement(yaml: string, flags: string[]): string {
	const lines = yaml.split("\n");
	const listHead = flags.length === 0 ? "  individual_flags: []" : "  individual_flags:";
	const range = section(lines, "flag_management");
	if (!range) {
		const block = [
			"flag_management:",
			"  default_rules:",
			"    carryforward: true",
			listHead,
			...flags.map(flagEntry),
		];
		const at = lines.indexOf("component_management:");
		if (at === -1) lines.push("", ...block);
		else lines.splice(at, 0, ...block, "");
		return lines.join("\n");
	}
	const [start, end] = range;
	const list = lines.findIndex((line, i) => i > start && i < end && /^ {2}individual_flags:/.test(line));
	if (list === -1) {
		lines.splice(end, 0, listHead, ...flags.map(flagEntry));
	} else if (/\[\s*\]\s*$/.test(lines[list]!)) {
		if (flags.length > 0) lines.splice(list, 1, listHead, ...flags.map(flagEntry));
	} else {
		appendMissingItems(lines, list, end, flags, FLAG_ENTRY, flagEntry);
	}
	return lines.join("\n");
}

/**
 * Scope `coverage.status.project.default` and `coverage.status.patch.default` to
 * the flags, so the required `codecov/project` and `codecov/patch` contexts keep
 * their names while only counting the grouped (non-`docs`) coverage. A block that
 * already lists flags only gains the missing ones; an inline `flags: [...]` is left alone.
 */
export function scopeAggregateStatuses(yaml: string, flags: string[]): string {
	if (flags.length === 0) return yaml;
	const lines = yaml.split("\n");
	for (const kind of ["project", "patch"]) {
		const at = lines.indexOf(`    ${kind}:`);
		if (at === -1 || lines[at + 1] !== "      default:") continue;
		let end = at + 2;
		while (end < lines.length && /^ {8}/.test(lines[end]!)) end++;
		const flagsAt = lines.findIndex((line, i) => i >= at + 2 && i < end && /^ {8}flags:/.test(line));
		if (flagsAt === -1) {
			lines.splice(at + 2, 0, "        flags:", ...flags.map((name) => `          - ${name}`));
		} else if (!/^ {8}flags:\s*\S/.test(lines[flagsAt]!)) {
			let listEnd = flagsAt + 1;
			while (listEnd < end && /^ {10}- /.test(lines[listEnd]!)) listEnd++;
			appendMissingItems(lines, flagsAt, listEnd, flags, /^ {10}- (\S+)/, (name) => `          - ${name}`);
		}
	}
	return lines.join("\n");
}

/**
 * Make the per-component statuses (`component_management.default_rules.statuses`)
 * informational, so the ~70 `codecov/patch/<component>` contexts post but never block.
 */
export function ensureInformationalComponentStatuses(yaml: string): string {
	const lines = yaml.split("\n");
	const range = section(lines, "component_management");
	if (!range) return yaml;
	const stop = lines.indexOf(INDIVIDUAL_COMPONENTS_MARKER);
	const limit = stop === -1 ? range[1] : stop;
	const starts = lines.flatMap((line, i) => (i > range[0] && i < limit && /^ {6}- type:/.test(line) ? [i] : []));
	for (const first of starts.reverse()) {
		let last = first + 1;
		while (last < limit && /^ {8}\S/.test(lines[last]!)) last++;
		if (!lines.slice(first, last).some((line) => /^ {8}informational:/.test(line))) {
			lines.splice(last, 0, "        informational: true");
		}
	}
	return lines.join("\n");
}

/** Everything `codecov.yml` needs on top of the components list: if_not_found, flags, scoped aggregates, informational components. */
function applyStatusRules(yaml: string, flags: string[]): string {
	return ensureInformationalComponentStatuses(
		scopeAggregateStatuses(ensureFlagManagement(ensureIfNotFound(yaml), flags), flags)
	);
}

export function mergeCodecovComponents(existing: string, packages: WorkspacePackage[]): string {
	const flags = codecovFlagNames(packages);
	const idx = existing.indexOf(INDIVIDUAL_COMPONENTS_MARKER);
	if (idx === -1) return applyStatusRules(existing, flags);
	return (
		applyStatusRules(existing.slice(0, idx + INDIVIDUAL_COMPONENTS_MARKER.length), flags) +
		codecovComponentBlock(packages)
	);
}

/**
 * Every package the repo's `pnpm-workspace.yaml` declares (the default roots
 * when it declares none), sorted by location, so each group folder (`cli/`, `plugins/`, ...) stays together. Every one needs a
 * codecov component so `codecov/patch/<slug>` actually posts for each. A
 * package at `<root>/<slug>` carries `dir: <root>`; one that is itself a
 * workspace folder (`observability`) or sits deeper (`docs/theme`) carries its
 * `path`. Two packages with the same folder name are told apart by their full
 * path (`docs-theme`). `[]` when there are none.
 */
export function readWorkspacePackages(repoRoot: string): WorkspacePackage[] {
	const found = discoverWorkspacePackages(repoRoot).flatMap(({ name, relativeDir }) => {
		return name ? [{ name, relativeDir, folder: relativeDir.split("/").at(-1)! }] : [];
	});
	const taken = new Map<string, number>();
	for (const { folder } of found) taken.set(folder, (taken.get(folder) ?? 0) + 1);

	return found
		.map(({ name, relativeDir, folder }): WorkspacePackage => {
			const slug = taken.get(folder)! > 1 ? relativeDir.replaceAll("/", "-") : folder;
			const segments = relativeDir.split("/");
			if (segments.length === 2 && slug === folder) return { slug, name, dir: segments[0]! };
			return { slug, name, path: relativeDir };
		})
		.sort((a, b) => location(a).localeCompare(location(b)));
}

/** A brand-new `codecov.yml` — the scaffold header + the base template + this repo's component list. */
export function createCodecovConfig(packages: WorkspacePackage[]): string {
	const base = applyStatusRules(codecovTemplate.trimEnd(), codecovFlagNames(packages));
	return `${scaffoldHeader()}${base}${codecovComponentBlock(packages)}`;
}

/**
 * The full pipeline `holocron repo setup` needs: read this repo's public
 * `packages/*`, then either merge them into an `existing` `codecov.yml` or
 * scaffold a new one.
 */
export function codecovConfig(repoRoot: string, existing: string | null): string {
	const packages = readWorkspacePackages(repoRoot);
	return existing != null ? mergeCodecovComponents(existing, packages) : createCodecovConfig(packages);
}
