/**
 * `holocron auth <subcommand>` — manage bootstrap credentials in the
 * OS keyring.
 *
 * Subcommands:
 *   auth set <provider> [token]   verify + store
 *   auth unset <provider>         remove
 *   auth check <provider>         re-verify a stored token
 *   auth list                     every provider with a stored entry
 *
 * See `docs/wiki/specifications/tech-auth-bootstrap.spec.md`.
 *
 * Verification lives in each plugin as a top-level `verifyToken(token)`
 * export. The auth command dynamically imports
 * `@theholocron/holocron-plugin-<provider>` and calls it. Plugins that
 * don't export `verifyToken` can still store — with a warning — because
 * "no verify path" shouldn't block credential storage.
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import type { Logger } from "@theholocron/observability/core";

import { deleteToken, getToken, listStoredProviders, setToken } from "../auth/keyring.js";
import { resolvePluginPackage } from "../config/config.js";
import { makeEnv } from "../env.js";
import { getLogger } from "../logger.js";
import { withSpinner } from "../ui/progress.js";
import { style } from "../ui/style.js";

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

interface AuthPluginModule {
	verifyToken?: (token: string) => Promise<VerifyTokenResult>;
	/** One-line hint printed when no token was supplied. */
	AUTH_HINT?: string;
}

export type AuthImporter = (packageName: string) => Promise<AuthPluginModule>;

const defaultImporter: AuthImporter = async (pkg) => {
	try {
		const localRequire = createRequire(process.cwd() + "/");
		const resolved = localRequire.resolve(pkg);
		return (await import(pathToFileURL(resolved).href)) as AuthPluginModule;
	} catch {
		return (await import(pkg)) as AuthPluginModule;
	}
};

// ── Common types ─────────────────────────────────────────────────────

export type AuthPrint = (line: string) => void;

export interface AuthCommandStatus {
	status: "ok" | "fail" | "skip";
	message?: string;
}

// ── Token resolution ─────────────────────────────────────────────────

/**
 * Resolve a token from (positional → HOLOCRON_<X> → vendor-native env).
 * Keyring is NOT consulted here — `auth set` writes TO the keyring, so
 * pulling FROM it would just re-store the same value.
 */
export function resolveAuthSetToken(input: {
	provider: string;
	positional?: string;
	env?: NodeJS.ProcessEnv;
}): string | null {
	const e = makeEnv(input.env);
	const upper = input.provider.toUpperCase();
	const holocronKey = `HOLOCRON_${upper}_TOKEN`;
	return input.positional || e.get(holocronKey) || e.get(`${upper}_TOKEN`) || null;
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

export async function runAuthSet(input: RunAuthSetInput): Promise<AuthCommandStatus> {
	const print = input.print ?? ((l: string) => console.log(l));
	const logger = input.logger ?? getLogger();
	const importer = input.importer ?? defaultImporter;
	const { provider } = input;
	const keyringKey = input.org ? `${provider}.${input.org}` : provider;

	const token = resolveAuthSetToken({ provider, positional: input.positional, env: input.env });

	// Feature sub-keys (e.g. "github.read") are stored directly — there is no
	// per-feature plugin package to load for verification.
	const isFeatureKey = provider.includes(".");
	const packageName = isFeatureKey ? null : resolvePluginPackage(provider);

	if (!token) {
		print(style.fail(`no token supplied for \`${keyringKey}\`.`));
		print(style.hint(`  pass as positional arg: holocron auth set ${provider} <token>`));
		if (!isFeatureKey) {
			print(
				style.hint(`  or via env: HOLOCRON_${provider.toUpperCase()}_TOKEN / ${provider.toUpperCase()}_TOKEN`)
			);
			const hint = await tryLoadHint(importer, packageName!);
			if (hint) {
				print(style.hint(`  hint: ${hint}`));
			}
		}
		logger.warn({ provider, keyringKey, reason: "no token supplied" }, `auth set: ${keyringKey}`);
		return { status: "fail", message: "no token supplied" };
	}

	// Verify via the plugin if it exports verifyToken (skipped for feature sub-keys).
	let subject: string | undefined;
	if (!isFeatureKey && packageName) {
		try {
			const module = await importer(packageName);
			if (typeof module.verifyToken === "function") {
				const verified = await module.verifyToken(token);
				if (!verified.ok) {
					print(style.fail(`token rejected by ${provider}: ${verified.message}`));
					if (module.AUTH_HINT) print(style.hint(`  hint: ${module.AUTH_HINT}`));
					logger.warn(
						{ provider, keyringKey, verified: false, reason: verified.message },
						`auth set: ${keyringKey}`
					);
					return { status: "fail", message: verified.message };
				}
				subject = verified.subject;
			} else {
				print(style.warn(`${provider} plugin has no verifyToken; storing without verification`));
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			print(style.warn(`cannot verify token — failed to load ${packageName}: ${msg}`));
			print(
				style.hint(`  storing token anyway; run 'holocron auth check ${provider}' once the plugin is installed`)
			);
		}
	}

	const stored = setToken(keyringKey, token);
	if (!stored) {
		print(style.fail(`keyring unavailable — token not stored. Use env vars instead.`));
		logger.warn({ provider, keyringKey, reason: "keyring unavailable" }, `auth set: ${keyringKey}`);
		return { status: "fail", message: "keyring unavailable" };
	}

	print(style.success(`stored ${keyringKey} token${subject ? ` (${subject})` : ""}`));
	logger.info(
		{ provider, keyringKey, verified: subject !== undefined, ...(subject ? { subject } : {}), status: "ok" },
		`auth set: ${keyringKey}`
	);
	return { status: "ok", ...(subject ? { message: subject } : {}) };
}

export interface RunAuthUnsetInput {
	provider: string;
	print?: AuthPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
}

export function runAuthUnset(input: RunAuthUnsetInput): AuthCommandStatus {
	const print = input.print ?? ((l: string) => console.log(l));
	const logger = input.logger ?? getLogger();
	const removed = deleteToken(input.provider);
	if (removed) {
		print(style.success(`removed ${input.provider} token`));
		logger.info({ provider: input.provider, status: "ok" }, `auth unset: ${input.provider}`);
		return { status: "ok" };
	}
	print(style.dim(`no stored token for ${input.provider}`));
	logger.info({ provider: input.provider, status: "skip" }, `auth unset: ${input.provider}`);
	return { status: "skip", message: "nothing to remove" };
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

export async function runAuthCheck(input: RunAuthCheckInput): Promise<AuthCommandStatus> {
	const print = input.print ?? ((l: string) => console.log(l));
	const logger = input.logger ?? getLogger();
	const importer = input.importer ?? defaultImporter;
	const { provider } = input;
	const keyringKey = input.org ? `${provider}.${input.org}` : provider;

	const token = getToken(keyringKey);
	if (!token) {
		print(style.dim(`no stored token for ${keyringKey}`));
		logger.info({ provider, keyringKey, status: "skip", reason: "no stored token" }, `auth check: ${keyringKey}`);
		return { status: "skip", message: "no stored token" };
	}

	// Feature sub-keys have no plugin to verify against — report stored only.
	if (provider.includes(".")) {
		print(style.success(`${keyringKey}: token stored (feature key — no plugin verification)`));
		return { status: "ok", message: "stored" };
	}

	const packageName = resolvePluginPackage(provider);
	try {
		const module = await importer(packageName);
		if (typeof module.verifyToken !== "function") {
			print(style.warn(`${keyringKey}: token stored (plugin has no verifyToken; can't confirm validity)`));
			return { status: "ok", message: "stored, unverified" };
		}
		const verify = () => module.verifyToken!(token);
		const verified =
			input.showSpinner !== false ? await withSpinner(`Verifying ${keyringKey} token…`, verify) : await verify();
		if (verified.ok) {
			print(style.success(`${keyringKey}: ok — ${verified.subject}`));
			logger.info(
				{ provider, keyringKey, verified: true, subject: verified.subject, status: "ok" },
				`auth check: ${keyringKey}`
			);
			return { status: "ok", message: verified.subject };
		}
		print(style.fail(`${keyringKey}: rejected — ${verified.message}`));
		if (module.AUTH_HINT) print(style.hint(`  hint: ${module.AUTH_HINT}`));
		logger.warn(
			{ provider, keyringKey, verified: false, reason: verified.message, status: "fail" },
			`auth check: ${keyringKey}`
		);
		return { status: "fail", message: verified.message };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		print(style.fail(`${keyringKey}: cannot verify — ${msg}`));
		logger.warn({ provider, keyringKey, reason: msg, status: "fail" }, `auth check: ${keyringKey}`);
		return { status: "fail", message: msg };
	}
}

export interface RunAuthListInput {
	importer?: AuthImporter;
	print?: AuthPrint;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
}

export async function runAuthList(input: RunAuthListInput = {}): Promise<AuthCommandStatus> {
	const print = input.print ?? ((l: string) => console.log(l));
	const logger = input.logger ?? getLogger();
	const importer = input.importer ?? defaultImporter;
	const providers = listStoredProviders();

	if (providers.length === 0) {
		print(style.dim("no stored tokens."));
		print(style.hint("run: holocron auth set <provider> <token>"));
		logger.info({ providers: 0 }, "auth list: done");
		return { status: "ok", message: "none" };
	}

	let ok = 0;
	let fail = 0;
	for (const provider of providers.sort()) {
		const check = await runAuthCheck({ provider, importer, print: () => {}, logger, showSpinner: false });
		const label = `${provider}${check.message ? ` — ${check.message}` : ""}`;
		if (check.status === "ok") {
			ok += 1;
			print(`  ${style.success(label)}`);
		} else if (check.status === "fail") {
			fail += 1;
			print(`  ${style.fail(label)}`);
		} else print(`  ${style.dim(`· ${label}`)}`);
	}
	logger.info({ providers: providers.length, ok, fail }, "auth list: done");
	return { status: "ok" };
}

// ── Helpers ──────────────────────────────────────────────────────────

async function tryLoadHint(importer: AuthImporter, packageName: string): Promise<string | null> {
	try {
		const module = await importer(packageName);
		return module.AUTH_HINT ?? null;
	} catch {
		return null;
	}
}
