import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { DnsRecordRequest, Wiki, WikiProvisionOpts, WikiProxyConfig } from "@theholocron/cli";
import { stringifyJson } from "@theholocron/json-utils";

import { AuthError, resolveToken, type ResolveTokenInput } from "../auth.js";

/** The Fern CLI version written into `fern/fern.config.json`. */
export const FERN_VERSION = "5.114.1";

/** Options for the Fern `wiki` capability. */
export interface FernWikiOptions extends ResolveTokenInput {
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
	/**
	 * One-line description shown on the global product switcher card.
	 * Falls back to the top-level `description` field in `holocron.config.ts`
	 * when omitted. Only used by `holocron repo sync --steps wiki`.
	 */
	subtitle?: string;
	/**
	 * Font Awesome icon class for the product switcher card (e.g. `"fa-duotone fa-gear"`).
	 * Only used by `holocron repo sync --steps wiki`.
	 */
	icon?: string;
}

/** `wiki` capability for Fern: writes the Fern config and docs scaffold for a repo. */
export class FernWiki implements Wiki {
	/** Capability key; always `"wiki"`. */
	readonly key = "wiki" as const;
	/** Provider name; always `"fern"`. */
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

	proxyConfig(): WikiProxyConfig | null {
		if (!this.opts.domain) return null;
		const hostname = this.opts.domain.split("/")[0]!;
		return {
			target: "https://app.buildwithfern.com",
			headers: { "X-Fern-Host": hostname },
		};
	}

	/**
	 * Confirms `HOLOCRON_FERN_TOKEN`/`FERN_TOKEN` resolves, or a Fern token
	 * is stored in the keyring — not a live check. Fern exposes no
	 * lightweight endpoint to verify a token actually works (the only
	 * token-consuming operation is a full `fern generate`, see
	 * holocron#1079); this only confirms one is configured, the same way
	 * CI's `fern generate --docs` step would find it.
	 *
	 * Deliberately ignores `cliToken` (`--token`): CI's step only ever sees
	 * the env var from a GitHub Actions secret, never a CLI flag — and a
	 * bare `--token <value>` meant for some OTHER provider is forwarded to
	 * every loaded plugin as a fallback (see AGENTS.md), so honoring it
	 * here would report "configured" even when no Fern-specific credential
	 * exists anywhere CI would actually look.
	 *
	 * Only `AuthError` (the specific "no token found" signal) is treated as
	 * `ok: false` — any other error (e.g. a real keyring failure) is a
	 * genuine problem and must surface as a failure, not get misreported as
	 * a missing token.
	 */
	async whoami(): Promise<{ ok: boolean }> {
		try {
			resolveToken({ ...this.opts, cliToken: undefined });
			return { ok: true };
		} catch (err) {
			if (err instanceof AuthError) return { ok: false };
			throw err;
		}
	}

	dnsRecord(): DnsRecordRequest | null {
		const { org, domain, fernOrg } = this.opts;
		if (!domain) return null;
		const resolvedFernOrg = fernOrg ?? org ?? "holocron";
		// Strip any basepath to get just the hostname for the CNAME.
		const hostname = domain.split("/")[0]!;
		// Derive zone: last two labels (works for most TLDs).
		const labels = hostname.split(".");
		const zone = labels.slice(-2).join(".");
		const target = `${resolvedFernOrg}.docs.buildwithfern.com`;
		return { zone, record: { type: "CNAME", name: hostname, content: target } };
	}
}

async function writeFernConfig({ repoRoot, fernOrg }: { repoRoot: string; fernOrg?: string }): Promise<string> {
	const fernDir = join(repoRoot, "fern");
	await mkdir(fernDir, { recursive: true });
	const org = fernOrg ?? "holocron";
	const content = stringifyJson({ organization: org, version: FERN_VERSION });
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

	const repoOwner = repo?.split("/")[0];

	// If docs.yml already exists, update the instances: block in-place and
	// leave everything else (navigation, colors, layout) untouched.
	let existing: string | null = null;
	try {
		existing = await readFile(docsPath, "utf8");
	} catch {
		// file not found — will write scaffold below
	}

	if (existing !== null) {
		const updated = updateInstancesBlock(existing, instanceUrl, customDomain, multiSource, repoOwner, repoName);
		if (updated !== existing) {
			await writeFile(docsPath, updated, "utf8");
			const domainPart = customDomain ? `, domain=${customDomain}${multiSource ? " (multi-source)" : ""}` : "";
			return `docs.yml: updated instances (url=${instanceUrl}${domainPart})`;
		}
		return "docs.yml: instances block already up to date";
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
		`  standards:`,
		`    display-name: Standards`,
		`    icon: fa-duotone fa-book`,
		`  specifications:`,
		`    display-name: Specifications`,
		`    icon: fa-duotone fa-file-lines`,
		``,
		`navigation:`,
		`  - tab: decisions`,
		`    layout:`,
		`      - section: Architecture Decision Records`,
		`        contents:`,
		`          - page: Index`,
		`            path: ../docs/wiki/decisions/README.md`,
		`  - tab: standards`,
		`    layout:`,
		`      - section: Standards`,
		`        contents:`,
		`          - page: Overview`,
		`            path: ../docs/wiki/standards/README.md`,
		`  - tab: specifications`,
		`    layout:`,
		`      - section: Specifications`,
		`        contents:`,
		`          - page: Overview`,
		`            path: ../docs/wiki/specifications/README.md`,
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

/**
 * Replace the `instances:` block in an existing docs.yml, preserving
 * everything else (navigation, colors, layout, title, etc.).
 *
 * Includes `edit-this-page:` nested under the instance when owner and
 * repoName are provided. Returns the original string unchanged when the
 * block already matches.
 */
function updateInstancesBlock(
	content: string,
	instanceUrl: string,
	customDomain: string | undefined,
	multiSource: boolean,
	repoOwner?: string,
	repoName?: string
): string {
	// Match `instances:` plus all lines that are indented or are list items.
	const blockRe = /^instances:(?:\n[ \t][^\n]*)*/m;
	const match = content.match(blockRe);
	if (!match) return content;

	const newLines = [`instances:`, `  - url: ${instanceUrl}`];
	if (customDomain) newLines.push(`    custom-domain: ${customDomain}`);
	if (multiSource) newLines.push(`    multi-source: true`);
	if (repoOwner && repoName)
		// prettier-ignore
		newLines.push(`    edit-this-page:`, `      github:`, `        owner: ${repoOwner}`, `        repo: ${repoName}`, `        branch: main`);
	const newBlock = newLines.join("\n");

	if (match[0] === newBlock) return content;
	return content.replace(blockRe, newBlock);
}
