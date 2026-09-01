import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Wiki, WikiDnsRecord, WikiProvisionOpts } from "@theholocron/cli";

export const FERN_VERSION = "5.35.4";

export interface FernWikiOptions {
	/** Absolute path to the working repo root. Injected by the loader from RuntimeContext. */
	repoRoot?: string;
	/** Active org name (e.g. "theholocron"). Injected by the loader from RuntimeContext. */
	org?: string;
	/**
	 * "owner/name" repo coordinate. Injected by the loader from RuntimeContext.
	 * Used to derive the per-repo basepath when multi-source custom domain is configured.
	 */
	repo?: string;
	/**
	 * Base domain for the Fern docs site (e.g. "wiki.theholocron.dev").
	 *
	 * When provided without a path, the repo name is appended automatically:
	 *   domain "wiki.theholocron.dev" + repo "owner/holocron"
	 *   → custom-domain: wiki.theholocron.dev/holocron
	 *   → multi-source: true
	 *
	 * You can also supply the full path explicitly:
	 *   domain "wiki.theholocron.dev/holocron"
	 *
	 * Note: password protection is configured in the Fern Dashboard
	 * (https://dashboard.buildwithfern.com) — it is not configurable via docs.yml.
	 */
	domain?: string;
	/**
	 * Fern workspace org slug. Defaults to `org` (the GitHub org name).
	 * Set this explicitly when the Fern workspace name differs from the
	 * GitHub org — e.g. the workspace was registered as "holocron" while
	 * the GitHub org is "theholocron".
	 */
	fernOrg?: string;
}

export class FernWiki implements Wiki {
	readonly key = "wiki" as const;
	readonly providerName = "fern";

	constructor(private readonly opts: FernWikiOptions) {}

	async provision(callOpts?: WikiProvisionOpts): Promise<string> {
		const repoRoot = this.opts.repoRoot ?? process.cwd();
		const { org, repo, domain, fernOrg } = this.opts;
		const name = callOpts?.name;
		const resolvedFernOrg = fernOrg ?? org;

		const configNote = await writeFernConfig({ repoRoot, fernOrg: resolvedFernOrg });
		const docsNote = await writeFernDocsYml({ repoRoot, fernOrg: resolvedFernOrg, repo, name, domain });
		return `${configNote}; ${docsNote}`;
	}

	dnsRecord(): WikiDnsRecord | null {
		const { org, domain, fernOrg } = this.opts;
		if (!domain) return null;
		const resolvedFernOrg = fernOrg ?? org ?? "holocron";
		// Strip any basepath to get just the hostname for the CNAME.
		const hostname = domain.split("/")[0]!;
		// Derive zone: last two labels (works for most TLDs).
		const labels = hostname.split(".");
		const zone = labels.slice(-2).join(".");
		const target = `${resolvedFernOrg}.docs.buildwithfern.com`;
		return { zone, cname: hostname, target };
	}
}

async function writeFernConfig({ repoRoot, fernOrg }: { repoRoot: string; fernOrg?: string }): Promise<string> {
	const fernDir = join(repoRoot, "fern");
	await mkdir(fernDir, { recursive: true });
	const org = fernOrg ?? "holocron";
	const content = JSON.stringify({ organization: org, version: FERN_VERSION }, null, 2) + "\n";
	await writeFile(join(fernDir, "fern.config.json"), content, "utf8");
	return `fern.config.json: org=${org}, version=${FERN_VERSION}`;
}

async function writeFernDocsYml({
	repoRoot,
	fernOrg,
	repo,
	name,
	domain,
}: {
	repoRoot: string;
	fernOrg?: string;
	repo?: string;
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

	const resolvedFernOrg = fernOrg ?? "holocron";
	const repoName = repo?.split("/").pop();

	// Derive instance URL, custom-domain, and multi-source flag.
	//
	// When domain has no path component and a repo name is available, append
	// the repo name as a basepath so all repos in the org share one domain:
	//   wiki.theholocron.dev/holocron, wiki.theholocron.dev/configs, …
	//
	// Fern requires the Fern instance URL to share the same basepath as the
	// custom-domain when multi-source: true (verified via NVIDIA examples).
	let instanceUrl: string;
	let customDomain: string | undefined;
	let multiSource = false;

	if (domain) {
		const slashIdx = domain.indexOf("/");
		if (slashIdx !== -1) {
			// Domain already contains a basepath — use as-is.
			const basepath = domain.slice(slashIdx + 1);
			instanceUrl = `${resolvedFernOrg}.docs.buildwithfern.com/${basepath}`;
			customDomain = domain;
			multiSource = true;
		} else if (repoName) {
			// Base domain only — append repo name as basepath.
			instanceUrl = `${resolvedFernOrg}.docs.buildwithfern.com/${repoName}`;
			customDomain = `${domain}/${repoName}`;
			multiSource = true;
		} else {
			// Domain provided but no repo to derive basepath — use domain directly.
			instanceUrl = `${resolvedFernOrg}.docs.buildwithfern.com`;
			customDomain = domain;
		}
	} else {
		instanceUrl = `${resolvedFernOrg}.docs.buildwithfern.com`;
	}

	const lines: string[] = [
		`# yaml-language-server: $schema=https://schema.buildwithfern.dev/docs-yml.json`,
		``,
		`instances:`,
		`  - url: ${instanceUrl}`,
	];
	if (customDomain) lines.push(`    custom-domain: ${customDomain}`);
	if (multiSource) lines.push(`    multi-source: true`);
	lines.push(
		``,
		`title: ${name ?? resolvedFernOrg} Engineering`,
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

	const domainSummary = customDomain ? `, domain=${customDomain}${multiSource ? " (multi-source)" : ""}` : "";
	return `docs.yml: url=${instanceUrl}${domainSummary}`;
}
