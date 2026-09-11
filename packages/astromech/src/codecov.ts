/**
 * `codecov.yml` generation — a manifest-derived artifact (component `paths`
 * come from workspace packages; the status targets track the `test` task's
 * coverage setup), the same category as the reusable `test.yml` this package
 * also generates. Moved out of `@theholocron/cli` (theholocron/holocron#650)
 * — `holocron setup`'s codecov step now calls {@link codecovConfig} instead
 * of importing this logic directly.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import codecovTemplate from "./templates/codecov/codecov.yml";

export interface WorkspacePackage {
	slug: string;
	name: string;
	/** Which workspace root the package was discovered under. Defaults to `"packages"`. */
	dir?: "packages" | "apps";
}

export const INDIVIDUAL_COMPONENTS_MARKER = "  individual_components:";

function scaffoldHeader(): string {
	return [
		`# Scaffolded by holocron setup — edit this file freely.`,
		`# Source:  theholocron/holocron · packages/astromech/src/codecov.ts`,
		``,
	].join("\n");
}

export function codecovComponentBlock(packages: WorkspacePackage[]): string {
	if (packages.length === 0) return "\n    []\n";
	return (
		"\n" +
		packages
			.flatMap(({ slug, dir }) => [
				`    - component_id: ${slug}`,
				`      name: "${slug}"`,
				`      paths:`,
				`        - ${dir ?? "packages"}/${slug}/**`,
				``,
			])
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

function readWorkspaceDir(repoRoot: string, dir: "packages" | "apps"): WorkspacePackage[] {
	const dirPath = join(repoRoot, dir);
	if (!existsSync(dirPath)) return [];
	const packages: WorkspacePackage[] = [];
	for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		try {
			const raw = readFileSync(join(dirPath, entry.name, "package.json"), "utf8");
			const pkg = JSON.parse(raw) as { name?: string };
			if (typeof pkg.name === "string") {
				packages.push({ slug: entry.name, name: pkg.name, dir });
			}
		} catch {
			// no package.json or invalid JSON — skip
		}
	}
	return packages;
}

/**
 * Every public `packages/*` and `apps/*` workspace, sorted by slug. `[]`
 * when neither directory exists. Monorepo templates (Next.js, React, …)
 * ship user-facing code under `apps/` alongside library code under
 * `packages/` — both need a codecov component so `codecov/patch/<slug>`
 * actually posts for each.
 */
export function readWorkspacePackages(repoRoot: string): WorkspacePackage[] {
	const packages = [...readWorkspaceDir(repoRoot, "packages"), ...readWorkspaceDir(repoRoot, "apps")];
	return packages.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** A brand-new `codecov.yml` — the scaffold header + the base template + this repo's component list. */
export function createCodecovConfig(packages: WorkspacePackage[]): string {
	return `${scaffoldHeader()}${codecovTemplate.trimEnd()}${codecovComponentBlock(packages)}`;
}

/**
 * The full pipeline `holocron setup` needs: read this repo's public
 * `packages/*`, then either merge them into an `existing` `codecov.yml` or
 * scaffold a new one.
 */
export function codecovConfig(repoRoot: string, existing: string | null): string {
	const packages = readWorkspacePackages(repoRoot);
	return existing != null ? mergeCodecovComponents(existing, packages) : createCodecovConfig(packages);
}
