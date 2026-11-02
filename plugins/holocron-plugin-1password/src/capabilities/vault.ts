/**
 * `vault` capability for 1Password.
 *
 * Shells out to the `op` CLI for every operation. Reference format
 * is 1P's native `op://Vault/Item/field` URI.
 *
 * Write semantics: 1P doesn't have an upsert. We probe `op item get`
 * first; if it returns 0 the item exists and we `op item edit`,
 * otherwise we `op item create --category=API Credential`. The
 * fallback gives us an idempotent create-or-update without us
 * parsing edit's stderr to detect "not found".
 */

import type { Vault } from "@theholocron/cli";
import { ProviderApiError } from "@theholocron/cli";

import { parseDotenv } from "../parse-dotenv.js";
import type { OpShell } from "../shell.js";

export interface OpVaultOptions {
	/**
	 * 1P vault name items live in. `list()` needs it; `read` and `write` take it from the `op://` reference, and
	 * Environments are not in a vault, so a project that only reads an Environment can leave it out.
	 */
	vault?: string;
}

interface OpItem {
	id: string;
	title: string;
	vault?: { id: string; name: string };
}

/** `vault` capability for 1Password, implemented by shelling out to the `op` CLI against one vault. */
export class OpVault implements Vault {
	/** Capability key; always `"vault"`. */
	readonly key = "vault" as const;
	/** Provider name; always `"1password"`. */
	readonly providerName = "1password";

	private readonly vaultName: string | undefined;

	constructor(
		private readonly shell: OpShell,
		opts: OpVaultOptions = {}
	) {
		this.vaultName = opts.vault || undefined;
	}

	// ── read / write ────────────────────────────────────────────────────

	async read(reference: string): Promise<string> {
		return this.shell.runOrThrow(["read", reference, "--no-newline"], `read ${reference}`);
	}

	async write(reference: string, value: string): Promise<void> {
		const parsed = parseReference(reference);
		// Probe — does the item exist?
		const probe = this.shell.run(["item", "get", parsed.item, `--vault=${parsed.vault}`, "--format=json"]);
		if (probe.ok) {
			this.shell.runOrThrow(
				["item", "edit", parsed.item, `--vault=${parsed.vault}`, `${parsed.field}=${value}`],
				`item edit ${parsed.item}`
			);
			return;
		}
		this.shell.runOrThrow(
			[
				"item",
				"create",
				`--title=${parsed.item}`,
				`--vault=${parsed.vault}`,
				"--category=API Credential",
				`${parsed.field}=${value}`,
			],
			`item create ${parsed.item}`
		);
	}

	// ── list ────────────────────────────────────────────────────────────

	async list(): Promise<string[]> {
		if (!this.vaultName) {
			throw new ProviderApiError(
				"1Password `list` needs a `vault` in the plugin options: it lists the items in one vault",
				400,
				undefined
			);
		}
		const stdout = this.shell.runOrThrow(
			["item", "list", `--vault=${this.vaultName}`, "--format=json"],
			`item list --vault=${this.vaultName}`
		);
		if (!stdout) return [];
		const parsed = JSON.parse(stdout) as OpItem[];
		return parsed.map((i) => i.title);
	}

	// ── environments ────────────────────────────────────────────────────

	/**
	 * Every variable of a 1Password Environment, by its name or id. `op environment read` takes only an id, while
	 * `op environment secret list` takes either, so this reads through the latter with the values revealed. There is
	 * no `op` command that lists Environments, so this vault has no `environments()`.
	 */
	async readEnvironment(environment: string): Promise<Record<string, string>> {
		const stdout = this.shell.runOrThrow(
			["environment", "secret", "list", environment, "--reveal", "--format=dotenv"],
			`environment secret list ${environment}`
		);
		return parseDotenv(stdout);
	}
}

// ── helpers ──────────────────────────────────────────────────────────

interface ParsedReference {
	vault: string;
	item: string;
	field: string;
}

/**
 * Parse `op://Vault/Item/field` into its parts. Throws when the
 * shape doesn't match — surfacing bad inputs at the boundary keeps
 * downstream `op item edit/create` from emitting cryptic errors.
 */
function parseReference(reference: string): ParsedReference {
	if (!reference.startsWith("op://")) {
		throw new ProviderApiError(`1Password references must start with "op://": got "${reference}"`, 400, undefined);
	}
	const rest = reference.slice("op://".length);
	const parts = rest.split("/");
	if (parts.length < 3) {
		throw new ProviderApiError(
			`1Password reference "${reference}" missing parts; expected op://Vault/Item/field`,
			400,
			undefined
		);
	}
	const [vault, item, ...fieldParts] = parts;
	return { vault: vault!, item: item!, field: fieldParts.join("/") };
}
