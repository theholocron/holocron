import type { Logger } from "@theholocron/observability/core";

// ── Plugin-level export shapes (mirrored on every plugin) ────────────

export interface VerifyTokenSuccess {
	ok: true;
	/** "workplace: acme" / "user: cnewton@x" — surfaced in success output. */
	subject: string;
}

export interface VerifyTokenFailure {
	ok: false;
	/** Reason the token was rejected. Surfaces to the operator. */
	message: string;
}

export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure;

export interface AuthPluginModule {
	verifyToken?: (token: string) => Promise<VerifyTokenResult>;
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
