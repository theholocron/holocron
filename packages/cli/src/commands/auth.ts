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
 * See `.notes/tech-auth-bootstrap.spec.md`.
 *
 * Verification lives in each plugin as a top-level `verifyToken(token)`
 * export. The auth command dynamically imports
 * `@theholocron/holocron-plugin-<provider>` and calls it. Plugins that
 * don't export `verifyToken` can still store — with a warning — because
 * "no verify path" shouldn't block credential storage.
 */

import { resolvePluginPackage } from "../config.js";
import { deleteToken, getToken, listStoredProviders, setToken } from "../keyring.js";
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

const defaultImporter: AuthImporter = async (pkg) => (await import(pkg)) as AuthPluginModule;

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
	const env = input.env ?? process.env;
	const upper = input.provider.toUpperCase();
	const holocronKey = `HOLOCRON_${upper}_TOKEN`;
	return input.positional || env[holocronKey] || env[upper + "_TOKEN"] || null;
}

// ── Subcommands ──────────────────────────────────────────────────────

export interface RunAuthSetInput {
	provider: string;
	positional?: string;
	env?: NodeJS.ProcessEnv;
	importer?: AuthImporter;
	print?: AuthPrint;
}

export async function runAuthSet(input: RunAuthSetInput): Promise<AuthCommandStatus> {
	const print = input.print ?? ((l: string) => console.log(l));
	const importer = input.importer ?? defaultImporter;
	const { provider } = input;

	const token = resolveAuthSetToken({ provider, positional: input.positional, env: input.env });

	// Feature sub-keys (e.g. "github.read") are stored directly — there is no
	// per-feature plugin package to load for verification.
	const isFeatureKey = provider.includes(".");
	const packageName = isFeatureKey ? null : resolvePluginPackage(provider);

	if (!token) {
		print(style.fail(`no token supplied for \`${provider}\`.`));
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

	const stored = setToken(provider, token);
	if (!stored) {
		print(style.fail(`keyring unavailable — token not stored. Use env vars instead.`));
		return { status: "fail", message: "keyring unavailable" };
	}

	print(style.success(`stored ${provider} token${subject ? ` (${subject})` : ""}`));
	return { status: "ok", ...(subject ? { message: subject } : {}) };
}

export interface RunAuthUnsetInput {
	provider: string;
	print?: AuthPrint;
}

export function runAuthUnset(input: RunAuthUnsetInput): AuthCommandStatus {
	const print = input.print ?? ((l: string) => console.log(l));
	const removed = deleteToken(input.provider);
	if (removed) {
		print(style.success(`removed ${input.provider} token`));
		return { status: "ok" };
	}
	print(style.dim(`no stored token for ${input.provider}`));
	return { status: "skip", message: "nothing to remove" };
}

export interface RunAuthCheckInput {
	provider: string;
	importer?: AuthImporter;
	print?: AuthPrint;
	/** Set to false to suppress the ora spinner (e.g. when called from runAuthList). */
	showSpinner?: boolean;
}

export async function runAuthCheck(input: RunAuthCheckInput): Promise<AuthCommandStatus> {
	const print = input.print ?? ((l: string) => console.log(l));
	const importer = input.importer ?? defaultImporter;
	const { provider } = input;

	const token = getToken(provider);
	if (!token) {
		print(style.dim(`no stored token for ${provider}`));
		return { status: "skip", message: "no stored token" };
	}

	// Feature sub-keys have no plugin to verify against — report stored only.
	if (provider.includes(".")) {
		print(style.success(`${provider}: token stored (feature key — no plugin verification)`));
		return { status: "ok", message: "stored" };
	}

	const packageName = resolvePluginPackage(provider);
	try {
		const module = await importer(packageName);
		if (typeof module.verifyToken !== "function") {
			print(style.warn(`${provider}: token stored (plugin has no verifyToken; can't confirm validity)`));
			return { status: "ok", message: "stored, unverified" };
		}
		const verify = () => module.verifyToken!(token);
		const verified =
			input.showSpinner !== false ? await withSpinner(`Verifying ${provider} token…`, verify) : await verify();
		if (verified.ok) {
			print(style.success(`${provider}: ok — ${verified.subject}`));
			return { status: "ok", message: verified.subject };
		}
		print(style.fail(`${provider}: rejected — ${verified.message}`));
		if (module.AUTH_HINT) print(style.hint(`  hint: ${module.AUTH_HINT}`));
		return { status: "fail", message: verified.message };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		print(style.fail(`${provider}: cannot verify — ${msg}`));
		return { status: "fail", message: msg };
	}
}

export interface RunAuthListInput {
	importer?: AuthImporter;
	print?: AuthPrint;
}

export async function runAuthList(input: RunAuthListInput = {}): Promise<AuthCommandStatus> {
	const print = input.print ?? ((l: string) => console.log(l));
	const importer = input.importer ?? defaultImporter;
	const providers = listStoredProviders();

	if (providers.length === 0) {
		print(style.dim("no stored tokens."));
		print(style.hint("run: holocron auth set <provider> <token>"));
		return { status: "ok", message: "none" };
	}

	for (const provider of providers.sort()) {
		const check = await runAuthCheck({ provider, importer, print: () => {}, showSpinner: false });
		const label = `${provider}${check.message ? ` — ${check.message}` : ""}`;
		if (check.status === "ok") print(`  ${style.success(label)}`);
		else if (check.status === "fail") print(`  ${style.fail(label)}`);
		else print(`  ${style.dim(`· ${label}`)}`);
	}
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
