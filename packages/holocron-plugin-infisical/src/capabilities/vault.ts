/**
 * `vault` capability for Infisical.
 *
 * Reference format: `infisical://<workspaceId>/<environment>/<name>`
 * — three parts, mirrors Doppler's `doppler://<project>/<config>/<name>`.
 * The plugin options carry a default `workspace` (workspace id) +
 * `environment` (slug, typically `dev`/`stg`/`prd`) so `list()` /
 * `environments()` / `readEnvironment()` don't need a three-part ref.
 *
 * Infisical's data model:
 *   - Workspace (aka project) — top-level container
 *   - Environments — dev / stg / prd, scoped to a workspace
 *   - Secrets — scoped to a workspace + environment, with a path
 *     (defaults to root `/` in this plugin; a `secretPath` option
 *     would extend it but Phase 1 keeps it flat)
 *
 * Write semantics: Infisical's REST API separates CREATE (`POST`) and
 * UPDATE (`PATCH`). We attempt POST first; on the vendor's "already
 * exists" response we PATCH to upsert. The isConflict helper follows
 * the same pattern as the Doppler plugin.
 *
 * Bootstrap semantics: `ensureProject` / `ensureEnvironment` treat
 * "already exists" as success. Both use the standard Infisical
 * workspace / environment create endpoints.
 */

import { ProviderApiError } from "@theholocron/cli";
import type { EnsureResult, Vault } from "@theholocron/cli";

import type { InfisicalRestClient } from "../rest.js";

export interface InfisicalVaultOptions {
	/** Default workspace (project) id — read/list/etc. operate here unless overridden. */
	workspace: string;
	/** Default environment slug — e.g., "dev", "stg", "prd". */
	environment: string;
}

interface SecretsListResponse {
	secrets?: Array<{ secretKey?: string; secretValue?: string }>;
}

interface SecretReadResponse {
	secret?: { secretKey?: string; secretValue?: string };
}

interface WorkspaceEnvironmentsResponse {
	workspace?: { environments?: Array<{ name?: string; slug?: string; id?: string }> };
}

interface WorkspaceListResponse {
	workspaces?: Array<{ _id?: string; id?: string; name?: string; slug?: string }>;
}

export class InfisicalVault implements Vault {
	readonly key = "vault" as const;
	readonly providerName = "infisical";

	private readonly workspace: string;
	private readonly environment: string;
	/**
	 * Cache of resolved workspace name/slug → id. `ensureEnvironment`
	 * is called once per environment during `holocron setup` (dev / stg
	 * / prd), so a single \`GET /v1/workspace\` lookup covers all three
	 * calls in the same run.
	 */
	private readonly workspaceIdCache = new Map<string, string>();

	constructor(
		private readonly rest: InfisicalRestClient,
		opts: InfisicalVaultOptions
	) {
		if (!opts.workspace) {
			throw new Error("InfisicalVault requires `workspace` in options");
		}
		if (!opts.environment) {
			throw new Error("InfisicalVault requires `environment` in options");
		}
		this.workspace = opts.workspace;
		this.environment = opts.environment;
	}

	// ── read / write ────────────────────────────────────────────────────

	async read(reference: string): Promise<string> {
		const parsed = parseReference(reference);
		const res = await this.rest.request<SecretReadResponse>(`/v3/secrets/raw/${encodeURIComponent(parsed.name)}`, {
			query: {
				workspaceId: parsed.workspace,
				environment: parsed.environment,
				secretPath: "/",
			},
		});
		return res.secret?.secretValue ?? "";
	}

	async write(reference: string, value: string): Promise<void> {
		const parsed = parseReference(reference);
		const body = {
			workspaceId: parsed.workspace,
			environment: parsed.environment,
			secretPath: "/",
			secretValue: value,
			type: "shared" as const,
		};
		try {
			await this.rest.request<unknown>(`/v3/secrets/raw/${encodeURIComponent(parsed.name)}`, {
				method: "POST",
				body,
			});
			return;
		} catch (err) {
			if (!isConflict(err)) throw err;
			// Already exists — fall through to update.
			await this.rest.request<unknown>(`/v3/secrets/raw/${encodeURIComponent(parsed.name)}`, {
				method: "PATCH",
				body,
			});
		}
	}

	async list(): Promise<string[]> {
		const res = await this.rest.request<SecretsListResponse>("/v3/secrets/raw", {
			query: {
				workspaceId: this.workspace,
				environment: this.environment,
				secretPath: "/",
			},
		});
		return (res.secrets ?? []).map((s) => s.secretKey ?? "").filter(Boolean);
	}

	// ── environments ────────────────────────────────────────────────────

	async environments(): Promise<string[]> {
		const res = await this.rest.request<WorkspaceEnvironmentsResponse>(
			`/v1/workspace/${encodeURIComponent(this.workspace)}`
		);
		return (res.workspace?.environments ?? []).map((e) => e.slug ?? e.name ?? "").filter(Boolean);
	}

	async readEnvironment(environmentId: string): Promise<Record<string, string>> {
		const res = await this.rest.request<SecretsListResponse>("/v3/secrets/raw", {
			query: {
				workspaceId: this.workspace,
				environment: environmentId,
				secretPath: "/",
			},
		});
		const out: Record<string, string> = {};
		for (const s of res.secrets ?? []) {
			if (s.secretKey && typeof s.secretValue === "string") {
				out[s.secretKey] = s.secretValue;
			}
		}
		return out;
	}

	// ── bootstrap ───────────────────────────────────────────────────────

	async ensureProject(name: string): Promise<EnsureResult> {
		try {
			await this.rest.request<unknown>("/v2/workspace", {
				method: "POST",
				body: { projectName: name, slug: name },
			});
			return { alreadyExists: false };
		} catch (err) {
			if (isConflict(err)) return { alreadyExists: true };
			throw err;
		}
	}

	async ensureEnvironment(project: string, name: string): Promise<EnsureResult> {
		const workspaceId = await this.resolveWorkspaceId(project);
		try {
			await this.rest.request<unknown>(`/v1/workspace/${encodeURIComponent(workspaceId)}/environments`, {
				method: "POST",
				body: { environmentName: name, environmentSlug: name },
			});
			return { alreadyExists: false };
		} catch (err) {
			if (isConflict(err)) return { alreadyExists: true };
			throw err;
		}
	}

	/**
	 * Resolve a workspace name / slug to its Infisical workspace id.
	 *
	 * `runSetup` calls `ensureEnvironment(config.project.name, envName)`
	 * — for Doppler that's directly the API's input, but Infisical's
	 * environments endpoint takes the workspace **id** (UUID/nanoid),
	 * not the name. This helper does the translation via
	 * `GET /v1/workspace` (which the token needs org-level list scope
	 * to call).
	 *
	 * Graceful degrade: for workspace-scoped tokens that 403 on the
	 * org-level list, we fall back to treating the input as an id
	 * directly. If the operator's `holocron.config.json` names a real
	 * id, the subsequent POST works. If they named a slug, the POST
	 * 404s and the operator gets a clear "workspace not found" error
	 * from the API — better than swallowing the 403 silently.
	 *
	 * Results are cached per-instance so the 3 back-to-back
	 * `ensureEnvironment` calls in `runSetup` share one lookup.
	 */
	private async resolveWorkspaceId(nameOrId: string): Promise<string> {
		const cached = this.workspaceIdCache.get(nameOrId);
		if (cached) return cached;

		try {
			const res = await this.rest.request<WorkspaceListResponse>("/v1/workspace");
			const match = (res?.workspaces ?? []).find((w) => w.name === nameOrId || w.slug === nameOrId);
			const resolvedId = match?._id ?? match?.id;
			if (resolvedId) {
				this.workspaceIdCache.set(nameOrId, resolvedId);
				return resolvedId;
			}
			// Listed workspaces successfully but no match by name/slug —
			// assume the input IS the id (or belongs to a workspace the
			// token can't see; either way, pass through and let the
			// subsequent POST speak for itself).
		} catch (err) {
			// 403 = workspace-scoped token can't list at org level. Not
			// fatal — fall through to id-passthrough. Other errors are
			// real problems.
			if (!(err instanceof ProviderApiError) || err.status !== 403) throw err;
		}
		return nameOrId;
	}
}

// ── helpers ──────────────────────────────────────────────────────────

interface ParsedReference {
	workspace: string;
	environment: string;
	name: string;
}

/**
 * Parse `infisical://<workspaceId>/<environment>/<name>` into its
 * parts. Throws when the shape doesn't match.
 */
function parseReference(reference: string): ParsedReference {
	if (!reference.startsWith("infisical://")) {
		throw new ProviderApiError(
			`Infisical references must start with "infisical://": got "${reference}"`,
			400,
			undefined
		);
	}
	const rest = reference.slice("infisical://".length);
	const parts = rest.split("/");
	if (parts.length < 3) {
		throw new ProviderApiError(
			`Infisical reference "${reference}" missing parts; expected infisical://<workspaceId>/<environment>/<name>`,
			400,
			undefined
		);
	}
	const [workspace, environment, ...nameParts] = parts;
	return { workspace: workspace!, environment: environment!, name: nameParts.join("/") };
}

/**
 * Infisical returns duplicate-create errors as 400 or 409 depending
 * on the endpoint, with a body message that includes "already exists"
 * (paraphrased). The REST client wraps both as ProviderApiError. We
 * accept 409 outright and treat 400/422 with an "already exists" body
 * as idempotent conflict — same pattern as the Doppler plugin.
 */
function isConflict(err: unknown): boolean {
	if (!(err instanceof ProviderApiError)) return false;
	if (err.status === 409) return true;
	if ((err.status === 400 || err.status === 422) && hasAlreadyExistsBody(err.details)) return true;
	return false;
}

function hasAlreadyExistsBody(details: unknown): boolean {
	if (typeof details !== "string") return false;
	return /already exists|duplicate/i.test(details);
}
