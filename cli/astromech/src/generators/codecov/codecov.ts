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

export function mergeCodecovComponents(existing: string, packages: WorkspacePackage[]): string {
	const idx = existing.indexOf(INDIVIDUAL_COMPONENTS_MARKER);
	if (idx === -1) return ensureIfNotFound(existing);
	return (
		ensureIfNotFound(existing.slice(0, idx + INDIVIDUAL_COMPONENTS_MARKER.length)) + codecovComponentBlock(packages)
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
	return `${scaffoldHeader()}${codecovTemplate.trimEnd()}${codecovComponentBlock(packages)}`;
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
