/**
 * `holocron doctor tokens` — is each token a configured plugin takes set, and still accepted?
 *
 * Read-only. For every token a configured plugin lists (its `tokens` export), the token is looked up the way the
 * plugin does it (the environment variable, then the OS keyring) and the plugin's `verifyToken` is asked whether it
 * is still accepted. A token is never printed. One that is not set is a skip, not a failure: whether it is needed
 * depends on what is run. One that is set and rejected (expired, revoked, malformed) fails.
 *
 * What a token may do is not checked: GitHub does not return a fine-grained token's permissions.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getToken } from "../../auth/index.js";
import { makeEnv } from "../../env/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { type AuthPluginModule, defaultImporter, type PluginToken } from "../auth/index.js";
import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "../doctor-checks/index.js";
import type { DoctorTokensReport, RunDoctorTokensInput } from "./doctor-tokens.type.js";

export async function runDoctorTokens(input: RunDoctorTokensInput): Promise<DoctorTokensReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const importer = input.importer ?? defaultImporter;
	const env = makeEnv(input.env);
	const keyring = input.keyring ?? getToken;

	const rows: CheckRow[] = [];
	for (const pkg of configuredPackages(input)) {
		let module: AuthPluginModule;
		try {
			module = await importer(pkg);
		} catch (err) {
			rows.push(row(pkg, "skip", `cannot load the plugin: ${errorMessage(err)}`));
			continue;
		}
		for (const token of module.tokens ?? []) {
			rows.push(await checkToken(token, module, env.get(token.envName), keyring));
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

/** The package of every provider the config names, once each. */
function configuredPackages(input: RunDoctorTokensInput): string[] {
	const packages = Object.values(input.loaded.resolved.providers).flatMap((entry) =>
		entry.cardinality === "single" ? [entry.tuple.packageName] : entry.tuples.map((t) => t.packageName)
	);
	return [...new Set(packages)];
}

function row(id: string, status: CheckRow["status"], detail: string): CheckRow {
	return { id, title: id, status, detail, problems: [] };
}

async function checkToken(
	token: PluginToken,
	module: AuthPluginModule,
	fromEnv: string | undefined,
	keyring: (key: string) => string | null
): Promise<CheckRow> {
	const { keyringKey, envName } = token;
	const value = fromEnv || keyring(keyringKey);
	if (!value) return row(keyringKey, "skip", `not set (${envName}, or \`holocron auth set ${keyringKey}\`)`);
	if (!module.verifyToken) return row(keyringKey, "skip", "set, but its plugin cannot verify it");
	const from = fromEnv ? envName : "keyring";
	try {
		const verified = await module.verifyToken(value);
		return verified.ok
			? row(keyringKey, "ok", `${verified.subject} (${from})`)
			: row(keyringKey, "fail", `rejected (${from}): ${verified.message}`);
	} catch (err) {
		return row(keyringKey, "fail", `could not be verified (${from}): ${errorMessage(err)}`);
	}
}
