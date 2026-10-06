/**
 * `deployment` capability for Netlify, against `@theholocron/netlify-client`.
 *
 * Sentinel (the actual driver for this plugin, holocron#940) only
 * exercises `ensureProject`, `deployFunction`, `getDeployment`,
 * `listEnvVars`/`setEnvVar`, and `ensureCustomDomain` — no Git
 * integration, no branch-triggered deploys. Those five are fully
 * implemented and tested against Netlify's real API shapes (verified
 * both via stubFetch and a live smoke test, see the client package).
 *
 * `triggerDeployment` and `updateProjectSettings` are REQUIRED by the
 * `Deployment` interface (not marked `?`) but aren't exercised by any
 * current consumer — Netlify's REST API doesn't expose a close
 * equivalent of Vercel's git-linked-project settings at all, so both are
 * best-effort / minimally-mapped. Flagged inline; revisit once a real
 * consumer needs them.
 */

import type {
	DeployFunctionConfig,
	DeployFunctionResult,
	Deployment,
	DeploymentProject,
	DeploymentProjectSettings,
	DeploymentRecord,
	DeploymentTarget,
	DeploymentTrigger,
	DnsRecordRequest,
} from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/http-client";
import type { NetlifyClient, NetlifyDeploy, NetlifyEnvContext, NetlifySite } from "@theholocron/netlify-client";

export interface NetlifyDeploymentOptions {
	/**
	 * Required for `ensureProject` / `listProjects` (create/list use
	 * Netlify's `/{account_slug}/sites` path).
	 */
	accountSlug?: string;
	/**
	 * Required for `listEnvVars` / `setEnvVar` (Netlify's env var API is
	 * scoped to `/accounts/{account_id}/env`, by id — not slug).
	 */
	accountId?: string;
	/** Custom domain `holocron setup` should attach to the site. */
	domain?: string;
}

const TERMINAL_READY = new Set(["ready", "current"]);
const TERMINAL_ERROR = new Set(["error"]);

function toDeploymentProject(site: NetlifySite): DeploymentProject {
	return { id: site.id, name: site.name, gitLinked: false, rootDirectory: null };
}

function toDeploymentRecord(deploy: NetlifyDeploy): DeploymentRecord {
	const record: DeploymentRecord = {
		id: deploy.id,
		url: deploy.ssl_url || deploy.url,
		branch: deploy.branch,
		status: TERMINAL_READY.has(deploy.state) ? "ready" : TERMINAL_ERROR.has(deploy.state) ? "error" : "building",
		createdAt: deploy.created_at,
	};
	if (deploy.error_message) record.errorMessage = deploy.error_message;
	return record;
}

/** Netlify's deploy contexts map onto Holocron's `production` / `staging` as: production stays production, everything else is staging. */
function toNetlifyContext(target: DeploymentTarget): NetlifyEnvContext {
	return target === "production" ? "production" : "branch-deploy";
}

export class NetlifyDeployment implements Deployment {
	readonly key = "deployment" as const;
	readonly providerName = "netlify";
	readonly domain?: string;

	constructor(
		private readonly client: () => NetlifyClient,
		private readonly opts: NetlifyDeploymentOptions = {}
	) {
		if (opts.domain !== undefined) this.domain = opts.domain;
	}

	async listProjects(): Promise<DeploymentProject[]> {
		const sites = await this.client().sites.list();
		return sites.map(toDeploymentProject);
	}

	/** Create if missing, otherwise return existing — matched by exact name. */
	async ensureProject(input: {
		name: string;
		framework?: string;
		repo?: string;
		rootDirectory?: string;
	}): Promise<DeploymentProject> {
		const existing = await this.findSiteByName(input.name);
		if (existing) return toDeploymentProject(existing);

		const accountSlug = this.opts.accountSlug;
		if (!accountSlug) {
			throw new Error(
				"@theholocron/holocron-plugin-netlify: ensureProject needs `accountSlug` in plugin options (Netlify's create-site endpoint is scoped to /{account_slug}/sites)"
			);
		}
		try {
			const created = await this.client().sites.create(accountSlug, { name: input.name });
			return toDeploymentProject(created);
		} catch (err) {
			// Idempotent per CLAUDE.md's standard: a 422 "name already exists"
			// landing between our find-by-name check and the create call
			// (another process creating the same site concurrently) is success,
			// not failure — re-check and return what's there now.
			if (err instanceof ProviderApiError && (err.status === 422 || err.status === 409)) {
				const recheck = await this.findSiteByName(input.name);
				if (recheck) return toDeploymentProject(recheck);
			}
			throw err;
		}
	}

	/**
	 * Netlify has no direct equivalent of Vercel's git-linked project
	 * settings (`previewDeploymentsDisabled` / `gitProviderCreateDeployments`)
	 * — Sentinel's site isn't git-linked at all. Best-effort: return the
	 * project unchanged. Revisit if a future consumer needs a real mapping.
	 */
	async updateProjectSettings(projectId: string, _settings: DeploymentProjectSettings): Promise<DeploymentProject> {
		const site = await this.client().sites.get(projectId);
		return toDeploymentProject(site);
	}

	async listEnvVars(projectId: string, target: DeploymentTarget): Promise<string[]> {
		const accountId = this.requireAccountId();
		const context = toNetlifyContext(target);
		const vars = await this.client().env.list(accountId, projectId);
		return vars.filter((v) => v.values.some((value) => value.context === context)).map((v) => v.key);
	}

	async setEnvVar(projectId: string, target: DeploymentTarget, name: string, value: string): Promise<void> {
		const accountId = this.requireAccountId();
		await this.client().env.set(accountId, projectId, name, toNetlifyContext(target), value);
	}

	/**
	 * No Git integration in Sentinel's usage (file-based deploy only), but
	 * REQUIRED by the interface. Netlify's branch-triggered-build endpoint
	 * is the closest analog for a git-linked site; untested against a real
	 * git-linked Netlify site since no current consumer exercises this path.
	 */
	async triggerDeployment(input: {
		projectId: string;
		branch: string;
		target?: DeploymentTrigger;
	}): Promise<DeploymentRecord> {
		const build = await this.client().sites.triggerBuild(input.projectId);
		if (!build.deploy_id) {
			throw new Error(
				"@theholocron/holocron-plugin-netlify: triggerDeployment got no deploy_id back from Netlify"
			);
		}
		const deploy = await this.client().deploys.get(build.deploy_id);
		return toDeploymentRecord(deploy);
	}

	async getDeployment(deploymentId: string): Promise<DeploymentRecord> {
		const deploy = await this.client().deploys.get(deploymentId);
		return toDeploymentRecord(deploy);
	}

	/**
	 * Zips `config.files` (plain text, per the interface contract) and
	 * uploads it as a one-shot deploy. Netlify runs no build step for a
	 * raw zip upload — the caller (Sentinel's own stage-deploy script) is
	 * responsible for having already resolved dependencies into the file
	 * set, the same discipline Vercel's `deployFunction` path already
	 * requires via its own trimmed/pinned package.json.
	 */
	async deployFunction(projectId: string, config: DeployFunctionConfig): Promise<DeployFunctionResult> {
		const deploy = await this.client().deploys.createFromZip(projectId, config.files, {
			draft: config.target === undefined,
		});
		return { deploymentId: deploy.id, url: deploy.ssl_url || deploy.url };
	}

	/**
	 * Idempotent: PATCHing the same `custom_domain` twice is a no-op on
	 * Netlify's side. Unlike Vercel, Netlify's API has no DNS-misconfiguration
	 * check to consult — it's returned unconditionally once set, which is
	 * safe because `Dns.upsertRecord()` on the receiving end is itself
	 * idempotent (re-upserting an already-correct CNAME is a no-op there).
	 */
	async ensureCustomDomain(projectId: string, hostname: string): Promise<DnsRecordRequest | null> {
		const site = await this.client().sites.get(projectId);
		if (site.custom_domain !== hostname) {
			await this.client().sites.update(projectId, { custom_domain: hostname });
		}

		// Naive apex derivation (last two labels) — correct for this org's
		// actual usage (*.theholocron.dev, a simple two-label TLD), not a
		// general public-suffix-list implementation. No Netlify endpoint
		// returns the apex the way Vercel's domains.add() does.
		const labels = hostname.split(".");
		const zone = labels.length > 2 ? labels.slice(-2).join(".") : hostname;
		const cnameTarget = new URL(site.ssl_url || site.url).hostname;

		return { zone, record: { type: "CNAME", name: hostname, content: cnameTarget } };
	}

	// ── internals ───────────────────────────────────────────────────────

	private async findSiteByName(name: string): Promise<NetlifySite | undefined> {
		const sites = await this.client().sites.list();
		return sites.find((s) => s.name === name);
	}

	private requireAccountId(): string {
		if (!this.opts.accountId) {
			throw new Error(
				"@theholocron/holocron-plugin-netlify: env var methods need `accountId` in plugin options (Netlify's env API is scoped to /accounts/{account_id}/env)"
			);
		}
		return this.opts.accountId;
	}
}
