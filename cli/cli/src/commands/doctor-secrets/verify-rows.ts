/**
 * The `--verify` side of `holocron doctor secrets`: is each token a configured plugin takes set, and still accepted?
 *
 * Read-only, and the only part of the command that calls a vendor. For every token a configured plugin lists (its
 * `tokens` export), the token is looked up the way the plugin does it (the process environment, then the repo's `.env`
 * and the `credentials` providers, then the OS keyring) and the plugin's `verifyToken` is asked whether it is still
 * accepted. Each row says where the token came from. A token is never printed. One that is not set is a skip, not a
 * failure: whether it is needed depends on what is run. One that is set and rejected (expired, revoked, malformed) fails,
 * and so does one that the plugin reports will expire within `TOKEN_EXPIRY_WARN_DAYS` days (a warning is a fail: the
 * check has no third status). A token with no expiry shows nothing extra.
 *
 * What a token may do is not checked: GitHub does not return a fine-grained token's permissions.
 */

import { createEnvLookup, type EnvLookup } from "@theholocron/env-utils/lookup";
import { findCredential } from "@theholocron/kyber/secrets";
import type { CheckRow } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { keyring } from "../../auth/index.js";
import type { PluginLoader } from "../../plugin/index.js";
import { type AuthImporter, type AuthPluginModule, defaultImporter, type PluginToken } from "../auth/index.js";
import { configuredPackages } from "./configured-packages.js";
import type { RunDoctorSecretsInput } from "./doctor-secrets.type.js";
import { describeExpiry } from "./token-expiry/index.js";

/** What `verifyRows()` needs. */
export interface VerifyRowsInput {
	/** The loaded config: its providers say which plugins to ask for their tokens. */
	loaded: RunDoctorSecretsInput["loaded"];
	/**
	 * Loads the repo's `.env` and the config's `credentials` providers into the credential store, the step every command
	 * runs first, so a token is found where the plugins find it.
	 */
	loader: Pick<PluginLoader, "load" | "loadFailures">;
	/** Loads a plugin package for its `tokens` and `verifyToken`. Defaults to resolving from the working directory. */
	importer?: AuthImporter;
	/** Environment to look tokens up in. Defaults to the process environment. */
	env?: NodeJS.ProcessEnv;
	/** Reads a keyring entry, or null. Defaults to the OS keyring. */
	keyring?: (key: string) => string | null;
	/** The current time, for how long a token has left. Defaults to the clock; tests pass a fixed one. */
	now?: () => Date;
}

function row(id: string, status: CheckRow["status"], detail: string): CheckRow {
	return { id: `verify:${id}`, title: `verify ${id}`, status, detail, problems: [] };
}

/**
 * Asks each configured plugin's vendor whether its token is still accepted.
 *
 * @param input - The config, the loader that fills the credential store, and (for a test) the importer, environment,
 *   keyring and clock.
 * @returns One row per token, plus a row for a credentials provider that could not be read.
 */
export async function verifyRows(input: VerifyRowsInput): Promise<CheckRow[]> {
	const importer = input.importer ?? defaultImporter;
	const env = createEnvLookup(input.env);
	const readToken = input.keyring ?? keyring.get;
	const now = input.now ?? (() => new Date());

	const rows: CheckRow[] = [];
	rows.push(...(await loadCredentials(input)));
	for (const pkg of configuredPackages(input)) {
		let module: AuthPluginModule;
		try {
			module = await importer(pkg);
		} catch (err) {
			rows.push(row(pkg, "skip", `cannot load the plugin: ${errorMessage(err)}`));
			continue;
		}
		for (const token of module.tokens ?? []) {
			rows.push(await checkToken(token, module, env, readToken, now()));
		}
	}
	if (rows.length === 0) {
		rows.push(row("tokens", "skip", "no configured plugin lists the tokens it takes"));
	}
	return rows;
}

/**
 * Runs the step every command runs first: the repo's `.env` and the config's `credentials` providers are read into the
 * credential store, which is where `checkToken` and the plugins look after the process environment. A provider that
 * could not be read is a failing row (its tokens then fall through to the keyring, which is not what was meant), and a
 * loader that throws is a skip.
 */
async function loadCredentials(input: VerifyRowsInput): Promise<CheckRow[]> {
	try {
		await input.loader.load();
	} catch (err) {
		return [row("credentials", "skip", `could not load the credentials providers: ${errorMessage(err)}`)];
	}
	return input.loader
		.loadFailures()
		.filter((failure) => failure.key === "credentials")
		.map((failure) =>
			row(`credentials ${failure.provider}`, "fail", `could not be read: ${errorMessage(failure.error)}`)
		);
}

async function checkToken(
	token: PluginToken,
	module: AuthPluginModule,
	env: EnvLookup,
	readToken: (key: string) => string | null,
	now: Date
): Promise<CheckRow> {
	const { keyringKey, envName, vendorEnvName } = token;
	// The order the plugins resolve in: the process environment (their own variable, then the vendor's), the credential
	// store (the repo's `.env`, then the `credentials` providers), then the keyring.
	const fromEnv = env.get(envName) ? envName : vendorEnvName && env.get(vendorEnvName) ? vendorEnvName : undefined;
	const stored = fromEnv ? undefined : findCredential(...(vendorEnvName ? [envName, vendorEnvName] : [envName]));
	const value = fromEnv ? env.get(fromEnv) : (stored?.value ?? readToken(keyringKey));
	if (!value) {
		const names = vendorEnvName ? `${envName} / ${vendorEnvName}` : envName;
		return row(keyringKey, "skip", `not set (${names}, or \`holocron new token ${keyringKey}\`)`);
	}
	const verify = token.verify ?? (token.verifiable === false ? undefined : module.verifyToken);
	if (!verify) {
		return row(keyringKey, "skip", "set, but its plugin cannot verify it");
	}
	const from = fromEnv ?? stored?.source ?? "keyring";
	try {
		const verified = await verify(value);
		if (!verified.ok) return row(keyringKey, "fail", `rejected (${from}): ${verified.message}`);
		const expiry = verified.expiresAt ? describeExpiry(verified.expiresAt, now) : undefined;
		if (!expiry) return row(keyringKey, "ok", `${verified.subject} (${from})`);
		// A warning is a failing row: the check has only ok / fail / skip, and a fail is what turns a scheduled run red.
		return expiry.soon
			? {
					...row(keyringKey, "fail", `${verified.subject} (${from}), ${expiry.text}`),
					problems: [`${expiry.text}: renew it`],
				}
			: row(keyringKey, "ok", `${verified.subject} (${from}), ${expiry.text}`);
	} catch (err) {
		return row(keyringKey, "fail", `could not be verified (${from}): ${errorMessage(err)}`);
	}
}
