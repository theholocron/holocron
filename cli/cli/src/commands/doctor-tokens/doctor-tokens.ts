/**
 * `holocron doctor tokens` — is each token a configured plugin takes set, and still accepted?
 *
 * Read-only. For every token a configured plugin lists (its `tokens` export), the token is looked up the way the
 * plugin does it (the process environment, then the repo's `.env` and the `credentials` providers, then the OS keyring)
 * and the plugin's `verifyToken` is asked whether it is still accepted. Each row says where the token came from. A token is never printed. One that is not set is a skip, not a failure: whether it is needed
 * depends on what is run. One that is set and rejected (expired, revoked, malformed) fails, and so does one that
 * the plugin reports will expire within `TOKEN_EXPIRY_WARN_DAYS` days (a warning is a fail: the check has no third
 * status). A token with no expiry shows nothing extra.
 *
 * What a token may do is not checked: GitHub does not return a fine-grained token's permissions.
 */

import { createEnvLookup, type EnvLookup } from "@theholocron/env-utils/lookup";
import { findCredential } from "@theholocron/kyber/secrets";
import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { keyring } from "../../auth/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { PluginLoader } from "../../plugin/index.js";
import { type AuthPluginModule, defaultImporter, type PluginToken } from "../auth/index.js";
import { configuredPackages } from "../doctor-secrets/configured-packages.js";
import type { DoctorTokensReport, RunDoctorTokensInput } from "./doctor-tokens.type.js";
import { describeExpiry } from "./token-expiry/index.js";

export async function runDoctorTokens(input: RunDoctorTokensInput): Promise<DoctorTokensReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
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

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor tokens");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: [...new Set(rows.map((r) => r.detail))].join("; ") } : {}),
	};
}

// ── helpers ──────────────────────────────────────────────────────────

/**
 * Runs the step every command runs first: the repo's `.env` and the config's `credentials` providers are read into the
 * credential store, which is where `checkToken` and the plugins look after the process environment. A provider that
 * could not be read is a failing row (its tokens then fall through to the keyring, which is not what was meant), and a
 * loader that throws is a skip.
 */
async function loadCredentials(input: RunDoctorTokensInput): Promise<CheckRow[]> {
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	try {
		await loader.load();
	} catch (err) {
		return [row("credentials", "skip", `could not load the credentials providers: ${errorMessage(err)}`)];
	}
	return loader
		.loadFailures()
		.filter((failure) => failure.key === "credentials")
		.map((failure) =>
			row(`credentials ${failure.provider}`, "fail", `could not be read: ${errorMessage(failure.error)}`)
		);
}

function row(id: string, status: CheckRow["status"], detail: string): CheckRow {
	return { id, title: id, status, detail, problems: [] };
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
