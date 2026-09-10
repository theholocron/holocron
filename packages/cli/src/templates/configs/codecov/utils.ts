import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface WorkspacePackage {
	slug: string;
	name: string;
}

export const INDIVIDUAL_COMPONENTS_MARKER = "  individual_components:";

export function codecovComponentBlock(packages: WorkspacePackage[]): string {
	if (packages.length === 0) return "\n    []\n";
	return (
		"\n" +
		packages
			.flatMap(({ slug }) => [
				`    - component_id: ${slug}`,
				`      name: "${slug}"`,
				`      paths:`,
				`        - packages/${slug}/**`,
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

export async function readWorkspacePackages(repoRoot: string): Promise<WorkspacePackage[]> {
	const packagesDir = join(repoRoot, "packages");
	const entries = await readdir(packagesDir, { withFileTypes: true }).catch(() => null);
	if (!entries) return [];
	const packages: WorkspacePackage[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		try {
			const raw = await readFile(join(packagesDir, entry.name, "package.json"), "utf8");
			const pkg = JSON.parse(raw) as { name?: string };
			if (typeof pkg.name === "string") {
				packages.push({ slug: entry.name, name: pkg.name });
			}
		} catch {
			// no package.json or invalid JSON — skip
		}
	}
	return packages.sort((a, b) => a.slug.localeCompare(b.slug));
}
