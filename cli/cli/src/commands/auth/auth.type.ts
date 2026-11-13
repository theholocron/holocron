import type { Logger } from "@theholocron/observability/core";

import type { EnvironmentLayer } from "../../credentials-environments/index.js";

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

/** What a layer's token must do about a permission: `required` it must have it, `absent` it must not. */
export type PermissionRule = "required" | "absent";

/**
 * When a token is due for rotation (#2157). `maxAgeDays` is the longest a token may go unrotated; `warnDays` is how
 * many days before an expiry the check starts to fail. Both default to `DEFAULT_TOKEN_ROTATION`.
 */
export interface TokenRotation {
	/** The most days old a token may be, counted from when the provider says it was made (or became valid). */
	maxAgeDays?: number;
	/** Fail this many days before the token's own expiry, so it is rotated before it stops working. */
	warnDays?: number;
}

/**
 * What a token must carry, declared once next to the plugin's `tokens` list. The permission names are the plugin's own
 * (Cloudflare: `pages`, `dns`); a layer's rules say which are `required` and which `absent`, so a laptop token might
 * need everything while `ci` needs one permission and must have none of the rest.
 */
export interface TokenExpectation {
	/**
	 * The layers that hold this token, for a token with no permission rules (a rotation-only check). Default: the layers
	 * `permissions` names. A layer in neither has no declared expectations.
	 */
	layers?: readonly EnvironmentLayer[];
	/** Per layer, each permission's rule. A layer named here holds the token. */
	permissions?: Readonly<Partial<Record<EnvironmentLayer, Readonly<Record<string, PermissionRule>>>>>;
	/** When the token is due for rotation, in every layer that holds it. Default: `DEFAULT_TOKEN_ROTATION`. */
	rotation?: TokenRotation;
}

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
	 * a webhook URL), so `holocron doctor secrets --verify` reports it as set without calling the plugin. Default `true`.
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
	 * `holocron doctor secrets`, do not expect it, and `holocron export tokens` marks it as optional when it has none.
	 * Default `false`.
	 */
	optional?: boolean;
	/**
	 * Which layers hold this token and what it must and must not be able to do in each (#2149). One declaration that the
	 * token probes, the doctor and the docs check read through `tokenExpectations()`; see `TokenExpectation`.
	 */
	expect?: TokenExpectation;
}

export interface AuthPluginModule {
	verifyToken?: (token: string) => Promise<VerifyTokenResult>;
	/** Every token the plugin takes, for `holocron doctor secrets --verify`. A plugin that lists none is not checked there. */
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
