/**
 * `vault` capability for Infisical.
 *
 * Reference format: `infisical://<workspaceId>/<environment>/<name>`
 * — three parts, mirrors Doppler's `doppler://<project>/<config>/<name>`.
 * The plugin options carry a default `workspace` (workspace id) +
 * `environment` (slug, typically `dev`/`stg`/`prd`) so `list()` /
 * `environments()` / `readEnvironment()` don't need a three-part ref.
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
import type { InfisicalClient } from "@theholocron/infisical-client";

export interface InfisicalVaultOptions {
	/** Default workspace (project) id — read/list/etc. operate here unless overridden. */
	workspace: string;
	/** Default environment slug — e.g., "dev", "stg", "prd". */
	environment: string;
}

export class InfisicalVault implements Vault {
	readonly key = "vault" as const;
	readonly providerName = "infisical";

	private readonly workspace: string;
	private readonly environment: string;
	/**
	 * Cache of resolved workspace name/slug → id. `ensureEnvironment`
	 * is called once per environment during `holocron setup` (dev / stg
	 * / prd), so a single `GET /v1/workspace` lookup covers all three
	 * calls in the same run.
	 */
	private readonly workspaceIdCache = new Map<string, string>();

	constructor(
		private readonly client: InfisicalClient,
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
		const { secret } = await this.client.secrets.get(parsed.name, {
			workspaceId: parsed.workspace,
			environment: parsed.environment,
			secretPath: "/",
		});
		return secret?.secretValue ?? "";
	}

	async write(reference: string, value: string): Promise<void> {
		const parsed = parseReference(reference);
		const scope = {
			workspaceId: parsed.workspace,
			environment: parsed.environment,
			secretPath: "/",
			secretValue: value,
		};
		try {
			await this.client.secrets.create(parsed.name, { ...scope, type: "shared" });
		} catch (err) {
			if (!isConflict(err)) throw err;
			await this.client.secrets.update(parsed.name, scope);
		}
	}

	async list(): Promise<string[]> {
		const { secrets } = await this.client.secrets.list({
			workspaceId: this.workspace,
			environment: this.environment,
			secretPath: "/",
		});
		return (secrets ?? []).map((s) => s.secretKey ?? "").filter(Boolean);
	}

	// ── environments ────────────────────────────────────────────────────

	async environments(): Promise<string[]> {
		const { workspace } = await this.client.workspaces.get(this.workspace);
		return (workspace?.environments ?? []).map((e) => e.slug ?? e.name ?? "").filter(Boolean);
	}

	async readEnvironment(environmentId: string): Promise<Record<string, string>> {
		const { secrets } = await this.client.secrets.list({
			workspaceId: this.workspace,
			environment: environmentId,
			secretPath: "/",
		});
		const out: Record<string, string> = {};
		for (const s of secrets ?? []) {
			if (s.secretKey && typeof s.secretValue === "string") {
				out[s.secretKey] = s.secretValue;
			}
		}
		return out;
	}

	// ── bootstrap ───────────────────────────────────────────────────────

	async ensureProject(name: string): Promise<EnsureResult> {
		try {
			await this.client.workspaces.create(name, name);
			return { alreadyExists: false };
		} catch (err) {
			if (isConflict(err)) return { alreadyExists: true };
			throw err;
		}
	}

	async ensureEnvironment(project: string, name: string): Promise<EnsureResult> {
		const workspaceId = await this.resolveWorkspaceId(project);
		try {
			await this.client.workspaces.createEnvironment(workspaceId, name, name);
			return { alreadyExists: false };
		} catch (err) {
			if (isConflict(err)) return { alreadyExists: true };
			throw err;
		}
	}

	private async resolveWorkspaceId(nameOrId: string): Promise<string> {
		const cached = this.workspaceIdCache.get(nameOrId);
		if (cached) return cached;

		try {
			const { workspaces } = await this.client.workspaces.list();
			const match = (workspaces ?? []).find((w) => w.name === nameOrId || w.slug === nameOrId);
			const resolvedId = match?._id ?? match?.id;
			if (resolvedId) {
				this.workspaceIdCache.set(nameOrId, resolvedId);
				return resolvedId;
			}
		} catch (err) {
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
