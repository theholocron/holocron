import type { Logger } from "@theholocron/observability/core";

// ── Plugin-level export shapes (mirrored on every plugin) ────────────

/** A plugin's `verifyToken` result when the provider accepted the token. */
export interface VerifyTokenSuccess {
	/** Always `true` for an accepted token. */
	ok: true;
	/** "workplace: acme" / "user: cnewton@x" — surfaced in success output. */
	subject: string;
	/** When the token stops working, ISO 8601 in UTC, for a provider that reports it. Absent when unknown or never. */
	expiresAt?: string;
}

/** A plugin's `verifyToken` result when the provider rejected the token. */
export interface VerifyTokenFailure {
	/** Always `false` for a rejected token. */
	ok: false;
	/** Reason the token was rejected. Surfaces to the operator. */
	message: string;
}

/** What a plugin's `verifyToken` returns: the token was accepted, or it was rejected with a reason. */
export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure;

/** One token a plugin takes, and where it is looked up. */
export interface PluginToken {
	/** The plugin's own environment variable, e.g. `HOLOCRON_ADMIN_TOKEN`. */
	envName: string;
	/** The vendor's own environment variable, e.g. `CLOUDFLARE_API_TOKEN`; read after `envName` and before the keyring. */
	vendorEnvName?: string;
	/** The OS keyring entry, e.g. `github.admin`. */
	keyringKey: string;
	/**
	 * `false` when the plugin's `verifyToken` does not apply to this token (it checks a different credential, such as
	 * a webhook URL), so `holocron doctor tokens` reports it as set without calling the plugin. Default `true`.
	 */
	verifiable?: boolean;
	/**
	 * How to check this token when the plugin's one `verifyToken` is for a different credential (the Discord bot token,
	 * where `verifyToken` checks a webhook). Wins over the plugin's `verifyToken`.
	 */
	verify?: (token: string) => Promise<VerifyTokenResult>;
	/**
	 * `true` when the plugin only falls back to this token: nothing needs it unless a call names no better source (the
	 * Discord webhook a post uses when it names no channel). The checks that expect every token a plugin lists, such as
	 * `holocron doctor credentials`, do not expect it, and `holocron export tokens` marks it as optional when it has none.
	 * Default `false`.
	 */
	optional?: boolean;
	/**
	 * What this token must and must not be able to do in each layer that holds it (`local`, `dev`, `ci`, `prod`; a layer
	 * left out has no declared expectations). The permission names are the plugin's own and `required` or `absent` is the
	 * rule: a laptop token might need all of a provider's permissions, while `ci` needs one and must not have the rest.
	 * A token probe (`holocron probe <provider> token --environment <layer>`) judges the token against it, and the
	 * permission table in `docs/src/content/docs/tokens.mdx` says the same in prose.
	 */
	expect?: Readonly<Record<string, Readonly<Partial<Record<string, "required" | "absent">>>>>;
}

export interface AuthPluginModule {
	verifyToken?: (token: string) => Promise<VerifyTokenResult>;
	/** Every token the plugin takes, for `holocron doctor tokens`. A plugin that lists none is not checked there. */
	tokens?: PluginToken[];
	/** One-line hint printed when no token was supplied. */
	AUTH_HINT?: string;
}

export type AuthImporter = (packageName: string) => Promise<AuthPluginModule>;

// ── Common types ─────────────────────────────────────────────────────

export type AuthPrint = (line: string) => void;

export interface AuthCommandStatus {
	status: "ok" | "fail" | "skip";
	message?: string;
}

// ── Subcommands ──────────────────────────────────────────────────────

export interface RunAuthSetInput {
	provider: string;
	positional?: string;
	env?: NodeJS.ProcessEnv;
	importer?: AuthImporter;
	print?: AuthPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** When set, stores the token under `<provider>.<org>` in the keyring. */
	org?: string;
	/**
	 * The `credentials` provider and environment the config names, when it has one. The CLI cannot write to it, so
	 * after the token is stored `new token` says which variable to add there by hand.
	 */
	credentials?: { provider: string; environment: string };
}

export interface RunAuthUnsetInput {
	provider: string;
	print?: AuthPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface RunAuthCheckInput {
	provider: string;
	importer?: AuthImporter;
	print?: AuthPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Set to false to suppress the ora spinner (e.g. when called from runAuthList). */
	showSpinner?: boolean;
	/** When set, checks the token stored under `<provider>.<org>` in the keyring. */
	org?: string;
}

export interface RunAuthListInput {
	importer?: AuthImporter;
	print?: AuthPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
}
