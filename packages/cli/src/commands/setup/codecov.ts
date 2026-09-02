import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { scaffoldHeader } from "../setup-workflows.js";

export interface WorkspacePackage {
	slug: string;
	name: string;
}

const INDIVIDUAL_COMPONENTS_MARKER = "  individual_components:";

function codecovComponentBlock(packages: WorkspacePackage[]): string {
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

export function mergeCodecovComponents(existing: string, packages: WorkspacePackage[]): string {
	const idx = existing.indexOf(INDIVIDUAL_COMPONENTS_MARKER);
	if (idx === -1) return existing;
	return existing.slice(0, idx + INDIVIDUAL_COMPONENTS_MARKER.length) + codecovComponentBlock(packages);
}

export function codecovContent(packages: WorkspacePackage[]): string {
	return (
		[
			scaffoldHeader("packages/cli/src/commands/setup/index.ts"),
			`codecov:`,
			`  require_ci_to_pass: true`,
			``,
			`coverage:`,
			`  precision: 2`,
			`  round: down`,
			`  status:`,
			`    project:`,
			`      default:`,
			`        target: auto`,
			`        threshold: 2%`,
			`    patch:`,
			`      default:`,
			`        target: 80%`,
			``,
			`comment:`,
			`  layout: "reach,diff,flags,components"`,
			`  behavior: default`,
			`  require_changes: true`,
			``,
			`component_management:`,
			`  default_rules:`,
			`    statuses:`,
			`      - type: patch`,
			`        target: 80%`,
			`  individual_components:`,
		].join("\n") + codecovComponentBlock(packages)
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
