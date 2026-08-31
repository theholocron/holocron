import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Wiki, WikiProvisionOpts } from "@theholocron/cli";

export const FERN_VERSION = "5.35.4";

export interface FernWikiOptions {
	/** Absolute path to the working repo root. Injected by the loader from RuntimeContext. */
	repoRoot?: string;
	/** Active org name (e.g. "theholocron"). Injected by the loader from RuntimeContext. */
	org?: string;
	/** Custom domain for the Fern docs instance (e.g. "engineering.theholocron.dev"). */
	domain?: string;
}

export class FernWiki implements Wiki {
	readonly key = "wiki" as const;
	readonly providerName = "fern";

	constructor(private readonly opts: FernWikiOptions) {}

	async provision(callOpts?: WikiProvisionOpts): Promise<string> {
		const repoRoot = this.opts.repoRoot ?? process.cwd();
		const { org, domain } = this.opts;
		const name = callOpts?.name;

		const configNote = await writeFernConfig({ repoRoot, org });
		const docsNote = await writeFernDocsYml({ repoRoot, org, name, domain });
		return `${configNote}; ${docsNote}`;
	}
}

async function writeFernConfig({ repoRoot, org }: { repoRoot: string; org?: string }): Promise<string> {
	const fernDir = join(repoRoot, "fern");
	await mkdir(fernDir, { recursive: true });
	const content = JSON.stringify({ organization: org ?? "holocron", version: FERN_VERSION }, null, 2) + "\n";
	await writeFile(join(fernDir, "fern.config.json"), content, "utf8");
	return `fern.config.json: org=${org ?? "holocron"}, version=${FERN_VERSION}`;
}

async function writeFernDocsYml({
	repoRoot,
	org,
	name,
	domain,
}: {
	repoRoot: string;
	org?: string;
	name?: string;
	domain?: string;
}): Promise<string> {
	const fernDir = join(repoRoot, "fern");
	await mkdir(fernDir, { recursive: true });
	const docsPath = join(fernDir, "docs.yml");
	// Skip if already present — user may have customised the ADR navigation entries.
	try {
		await access(docsPath);
		return "docs.yml: skipped (exists — update navigation manually)";
	} catch {
		// file not found — write scaffold
	}
	const instanceUrl = `${org ?? "holocron"}.docs.buildwithfern.com`;
	const lines: string[] = [
		`# yaml-language-server: $schema=https://schema.buildwithfern.dev/docs-yml.json`,
		``,
		`instances:`,
		`  - url: ${instanceUrl}`,
	];
	if (domain) lines.push(`    custom-domain: ${domain}`);
	lines.push(
		``,
		`title: ${name ?? org ?? "Engineering"} Engineering`,
		``,
		`layout:`,
		`  page-width: full`,
		`  tabs-placement: header`,
		`  searchbar-placement: header`,
		``,
		`tabs:`,
		`  decisions:`,
		`    display-name: Decisions`,
		`    icon: fa-duotone fa-scale-balanced`,
		`  engineering:`,
		`    display-name: Engineering`,
		`    icon: fa-duotone fa-gear`,
		``,
		`navigation:`,
		`  - tab: decisions`,
		`    layout:`,
		`      - section: Architecture Decision Records`,
		`        contents:`,
		`          - page: Index`,
		`            path: ../docs/decisions/README.md`,
		`  - tab: engineering`,
		`    layout:`,
		`      - section: Overview`,
		`        contents:`,
		`          - page: Engineering Home`,
		`            path: ../docs/engineering/README.md`,
		``,
		`colors:`,
		`  accent-primary:`,
		`    dark: "#70E155"`,
		`    light: "#008700"`,
		``,
		`logo:`,
		`  height: 20`,
		``,
		`metadata:`,
		`  og:dynamic: true`,
		``
	);
	await writeFile(docsPath, lines.join("\n"), "utf8");
	return `docs.yml: url=${instanceUrl}${domain ? `, domain=${domain}` : ""}`;
}
