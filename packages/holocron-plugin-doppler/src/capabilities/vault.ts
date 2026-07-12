/**
 * `vault` capability for Doppler.
 *
 * Reference format: `doppler://<project>/<config>/<name>` — three
 * parts, mirrors 1P's `op://Vault/Item/field`. The plugin options can
 * carry a default project + config so `list()` / `environments()` /
 * `readEnvironment()` don't need a three-part ref.
 *
 * Doppler's data model:
 *   - Projects (top-level)
 *   - Environments — dev / stg / prd (each has a root config with the
 *     same name)
 *   - Configs — the root configs plus optional branch configs (e.g.,
 *     `dev_local`, `dev_ci`). `holocron secrets sync` reads from
 *     configs, not environments.
 *
 * Write semantics: `POST /v3/configs/config/secrets` accepts a
 * `{name: value}` map and upserts. No probe-then-act dance needed.
 *
 * Bootstrap semantics: `ensureProject` / `ensureEnvironment` treat
 * "already exists" (409) as success. Doppler returns 409 with a
 * `messages` array; the plugin's REST client wraps it as
 * ProviderApiError with `status: 409` which we catch and swallow.
 */

import { ProviderApiError } from "@theholocron/cli";
import type { EnsureResult, Vault } from "@theholocron/cli";

import type { RestClient } from "@theholocron/cli";

export interface DopplerVaultOptions {
	/** Default project — read/list/etc. operate here unless overridden. */
	project: string;
	/** Default config name — dev / stg / prd, etc. */
	config: string;
}

interface SecretsListResponse {
	secrets?: Record<string, { raw?: string; computed?: string } | null>;
}

interface SecretReadResponse {
	name?: string;
	value?: { raw?: string; computed?: string } | null;
}

interface SecretsDownloadResponse {
	// `format=json` returns `{NAME: "value", ...}` at the top level.
	[key: string]: string;
}

interface EnvironmentsListResponse {
	environments?: Array<{ id?: string; name?: string; slug?: string }>;
}

export class DopplerVault implements Vault {
	readonly key = "vault" as const;
	readonly providerName = "doppler";

	private readonly project: string;
	private readonly config: string;

	constructor(
		private readonly rest: RestClient,
		opts: DopplerVaultOptions
	) {
		if (!opts.project) {
			throw new Error("DopplerVault requires `project` in options");
		}
		if (!opts.config) {
			throw new Error("DopplerVault requires `config` in options");
		}
		this.project = opts.project;
		this.config = opts.config;
	}

	// ── read / write ────────────────────────────────────────────────────

	async read(reference: string): Promise<string> {
		const parsed = parseReference(reference);
		const res = await this.rest.request<SecretReadResponse>("/configs/config/secret", {
			query: { project: parsed.project, config: parsed.config, name: parsed.name },
		});
		return res.value?.computed ?? res.value?.raw ?? "";
	}

	async write(reference: string, value: string): Promise<void> {
		const parsed = parseReference(reference);
		await this.rest.request<unknown>("/configs/config/secrets", {
			method: "POST",
			body: {
				project: parsed.project,
				config: parsed.config,
				secrets: { [parsed.name]: value },
			},
		});
	}

	async list(): Promise<string[]> {
		const res = await this.rest.request<SecretsListResponse>("/configs/config/secrets", {
			query: { project: this.project, config: this.config },
		});
		return Object.keys(res.secrets ?? {});
	}

	// ── environments ────────────────────────────────────────────────────

	async environments(): Promise<string[]> {
		const res = await this.rest.request<EnvironmentsListResponse>("/environments", {
			query: { project: this.project },
		});
		return (res.environments ?? []).map((e) => e.slug ?? e.name ?? "").filter(Boolean);
	}

	async readEnvironment(environmentId: string): Promise<Record<string, string>> {
		const res = await this.rest.request<SecretsDownloadResponse>("/configs/config/secrets/download", {
			query: { project: this.project, config: environmentId, format: "json" },
		});
		// Filter out any non-string entries defensively.
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(res)) {
			if (typeof v === "string") out[k] = v;
		}
		return out;
	}

	// ── bootstrap ───────────────────────────────────────────────────────

	async ensureProject(name: string): Promise<EnsureResult> {
		try {
			await this.rest.request<unknown>("/projects", {
				method: "POST",
				body: { name, description: `Managed by holocron` },
			});
			return { alreadyExists: false };
		} catch (err) {
			if (isConflict(err)) return { alreadyExists: true };
			throw err;
		}
	}

	async ensureEnvironment(project: string, name: string): Promise<EnsureResult> {
		try {
			await this.rest.request<unknown>("/environments", {
				method: "POST",
				body: { project, name, slug: name },
			});
			return { alreadyExists: false };
		} catch (err) {
			if (isConflict(err)) return { alreadyExists: true };
			throw err;
		}
	}
}

// ── helpers ──────────────────────────────────────────────────────────

interface ParsedReference {
	project: string;
	config: string;
	name: string;
}

/**
 * Parse `doppler://project/config/name` into its parts. Throws when
 * the shape doesn't match — surfacing bad inputs at the boundary keeps
 * downstream REST calls from emitting cryptic errors.
 */
function parseReference(reference: string): ParsedReference {
	if (!reference.startsWith("doppler://")) {
		throw new ProviderApiError(
			`Doppler references must start with "doppler://": got "${reference}"`,
			400,
			undefined
		);
	}
	const rest = reference.slice("doppler://".length);
	const parts = rest.split("/");
	if (parts.length < 3) {
		throw new ProviderApiError(
			`Doppler reference "${reference}" missing parts; expected doppler://project/config/name`,
			400,
			undefined
		);
	}
	const [project, config, ...nameParts] = parts;
	return { project: project!, config: config!, name: nameParts.join("/") };
}

/**
 * Doppler returns duplicate-create errors inconsistently across
 * endpoints:
 *
 *   - POST /projects → 409 (or 422 with "already exists" body)
 *   - POST /environments → 400 with body
 *       `{"messages":["Environment with identifier dev already exists"],"success":false}`
 *
 * The REST client wraps all of these as ProviderApiError. We accept 409
 * outright + treat 400/422 as "already exists" when the response body
 * says so — matches Doppler's actual behavior.
 */
function isConflict(err: unknown): boolean {
	if (!(err instanceof ProviderApiError)) return false;
	if (err.status === 409) return true;
	if ((err.status === 400 || err.status === 422) && hasAlreadyExistsBody(err.details)) return true;
	return false;
}

function hasAlreadyExistsBody(details: unknown): boolean {
	if (typeof details !== "string") return false;
	return /already exists/i.test(details);
}
