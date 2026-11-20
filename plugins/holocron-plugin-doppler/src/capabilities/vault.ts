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
 *     `dev_local`, `dev_ci`). `holocron sync secrets` reads from
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

import type {
	EnsureRelaySourceInput,
	EnsureRelaySourceResult,
	EnsureResult,
	InspectRelaySourceInput,
	RelaySourceState,
	Vault,
} from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";
import type { DopplerWebhook } from "@theholocron/doppler-client";

import type { DopplerClient } from "../rest.js";

export interface DopplerVaultOptions {
	/** Default project — read/list/etc. operate here unless overridden. */
	project: string;
	/** Default config name — dev / stg / prd, etc. */
	config: string;
}

/**
 * Doppler auto-injects these into every config's secrets download —
 * bookkeeping about the config itself, not something any caller
 * defined. `readEnvironment()` fans its result out to real destinations
 * (`holocron sync secrets` → CI secrets, deploy env vars); shipping
 * these alongside real secrets is pure noise there (theholocron/holocron#742
 * — found via Sentinel's deploy picking them up as if they were its own
 * env). Confirmed stable, documented Doppler behavior — not
 * project/config-specific, so safe to filter by name unconditionally.
 */
const DOPPLER_INJECTED_KEYS = new Set(["DOPPLER_PROJECT", "DOPPLER_CONFIG", "DOPPLER_ENVIRONMENT"]);

/** `vault` capability for Doppler, with references shaped `doppler://<project>/<config>/<name>`. */
export class DopplerVault implements Vault {
	/** Capability key; always `"vault"`. */
	readonly key = "vault" as const;
	/** Provider name; always `"doppler"`. */
	readonly providerName = "doppler";

	private readonly project: string;
	private readonly config: string;

	constructor(
		private readonly client: () => DopplerClient,
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
		const res = await this.client().secrets.get(parsed.project, parsed.config, parsed.name);
		return res.value?.computed ?? res.value?.raw ?? "";
	}

	async readSecret(name: string): Promise<string> {
		const res = await this.client().secrets.get(this.project, this.config, name);
		return res.value?.computed ?? res.value?.raw ?? "";
	}

	async write(reference: string, value: string): Promise<void> {
		const parsed = parseReference(reference);
		await this.client().secrets.update(parsed.project, parsed.config, { [parsed.name]: value });
	}

	async list(): Promise<string[]> {
		const res = await this.client().secrets.list(this.project, this.config);
		return Object.keys(res.secrets ?? {});
	}

	// ── environments ────────────────────────────────────────────────────

	async environments(): Promise<string[]> {
		const res = await this.client().environments.list(this.project);
		return (res.environments ?? []).map((e) => e.slug ?? e.name ?? "").filter(Boolean);
	}

	async readEnvironment(environmentId: string): Promise<Record<string, string>> {
		const res = await this.client().secrets.download(this.project, environmentId);
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(res)) {
			// Filter out any non-string entries defensively, and Doppler's own
			// injected bookkeeping keys (see DOPPLER_INJECTED_KEYS).
			if (typeof v === "string" && !DOPPLER_INJECTED_KEYS.has(k)) out[k] = v;
		}
		return out;
	}

	// ── relay source (Comlink) ──────────────────────────────────────────

	/**
	 * Make the Doppler webhook for a relay source, found again by its URL in the project (`options.project`, else the
	 * vault's). `scope` is the config slugs it fires for; `events` has no meaning here (a Doppler webhook fires on
	 * secret changes) and is ignored. The secret in the input is the signing secret and is sent only on create; Doppler
	 * never returns it. An existing webhook is adopted unchanged: no update call is made, `inspectRelaySource` reports
	 * a difference. Doppler does not document which token type may manage webhooks, so a 401/403 is a `todo`.
	 */
	async ensureRelaySource(input: EnsureRelaySourceInput): Promise<EnsureRelaySourceResult> {
		const project = this.relayProject(input);
		let found: DopplerWebhook | undefined;
		try {
			found = await this.findWebhook(project, input.url);
		} catch (err) {
			const todo = webhookAccessTodo(err, project);
			if (todo) return { created: false, updated: [], todo: [todo] };
			throw err;
		}
		if (found) return { created: false, updated: [] };
		try {
			await this.client().webhooks.create(project, {
				url: input.url,
				name: input.name,
				...(input.secret ? { secret: input.secret } : {}),
				...(input.scope ? { enableConfigs: input.scope } : {}),
			});
		} catch (err) {
			const todo = webhookAccessTodo(err, project);
			if (todo) return { created: false, updated: [], todo: [todo] };
			throw err;
		}
		return { created: true, updated: [], ...(input.secret ? { secret: input.secret } : {}) };
	}

	/** Read the webhook back by URL: whether it exists, is enabled, covers every declared config and has a secret. */
	async inspectRelaySource(input: InspectRelaySourceInput): Promise<RelaySourceState> {
		const found = await this.findWebhook(this.relayProject(input), input.url);
		if (!found) return { exists: false };
		return {
			exists: true,
			...(found.enabled !== undefined ? { enabled: found.enabled } : {}),
			...(found.enabledConfigs ? { scope: found.enabledConfigs } : {}),
			...(found.hasSecret !== undefined ? { hasSecret: found.hasSecret } : {}),
		};
	}

	private relayProject(input: InspectRelaySourceInput): string {
		const project = input.options?.project;
		return typeof project === "string" && project ? project : this.project;
	}

	private async findWebhook(project: string, url: string): Promise<DopplerWebhook | undefined> {
		const res = await this.client().webhooks.list(project);
		return (res.webhooks ?? []).find((w) => w.url === url);
	}

	// ── bootstrap ───────────────────────────────────────────────────────

	async ensureProject(name: string): Promise<EnsureResult> {
		try {
			await this.client().projects.create(name, "Managed by holocron");
			return { alreadyExists: false };
		} catch (err) {
			if (isConflict(err)) return { alreadyExists: true };
			throw err;
		}
	}

	async ensureEnvironment(project: string, name: string): Promise<EnsureResult> {
		try {
			await this.client().environments.create(project, name, name);
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
	return { project: project, config: config, name: nameParts.join("/") };
}

/**
 * A refused webhook call as a step for a person. Doppler's reference does not say which token type may manage
 * webhooks (a service token is limited to one config's secrets), so a refusal names what to try, never a guess.
 */
function webhookAccessTodo(err: unknown, project: string): string | undefined {
	if (err instanceof ProviderApiError && (err.status === 401 || err.status === 403)) {
		return (
			`Doppler refused the webhook call for project ${project}: use a token that can manage the project's webhooks ` +
			`(a personal token of a member who can, not a config-scoped service token), or add the webhook in the ` +
			`project's Webhooks page and set the secret yourself`
		);
	}
	return undefined;
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
