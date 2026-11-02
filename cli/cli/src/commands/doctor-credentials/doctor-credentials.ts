/**
 * `holocron doctor credentials` — does the credentials environment exist, and does it hold the tokens the plugins take?
 *
 * Read-only, and it never reads a value: the providers are loaded without being asked for their variables, and each
 * one lists only the names (`Credentials.inspect`). The names expected are the `envName` of every token the configured
 * plugins list (their `tokens` export, the same list `doctor tokens` checks). A variable the environment lacks is a
 * failure; one it has beyond those is not a problem. The row says which spelling of the environment's name matched,
 * since a provider that matches names exactly may find it under a different case than the config writes.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, type Credentials, PluginLoader } from "../../plugin/index.js";
import { defaultImporter } from "../auth/index.js";
import {
	type CheckRow,
	declaredVsActual,
	printCheckRows,
	printCheckSummary,
	summariseChecks,
} from "../doctor-checks/index.js";
import { configuredPackages } from "../doctor-tokens/index.js";
import type { DoctorCredentialsReport, RunDoctorCredentialsInput } from "./doctor-credentials.type.js";

export async function runDoctorCredentials(input: RunDoctorCredentialsInput): Promise<DoctorCredentialsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader =
		input.loader ?? new PluginLoader(input.loaded.resolved, input.context, undefined, { readCredentials: false });
	await loader.load();
	assertPluginsResolvable(loader, "doctor credentials");

	const rows = await checkCredentials(input, loader);

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor credentials");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: [...new Set(rows.map((r) => r.detail))].join("; ") } : {}),
	};
}

// ── helpers ──────────────────────────────────────────────────────────

function row(provider: string, status: CheckRow["status"], detail: string, problems: string[] = []): CheckRow {
	return { id: provider, title: `credentials: ${provider}`, status, detail, problems };
}

async function checkCredentials(input: RunDoctorCredentialsInput, loader: PluginLoader): Promise<CheckRow[]> {
	const { resolved } = input.loaded;
	if (!resolved.providers.credentials) {
		return [row("credentials", "skip", "no `credentials` provider is configured")];
	}
	const environment = resolved.credentials?.environment;
	if (!environment) {
		return [row("credentials", "skip", "`credentials.environment` is not set")];
	}
	const rows: CheckRow[] = loader
		.loadFailures()
		.filter((f) => f.key === "credentials")
		.map((f) => row(f.provider, "fail", `failed to load: ${errorMessage(f.error)}`));
	if (!loader.has("credentials")) return rows;

	const expected = await expectedNames(input);
	for (const impl of loader.get("credentials") as Credentials[]) {
		rows.push(await checkProvider(impl, environment, expected));
	}
	return rows;
}

async function checkProvider(impl: Credentials, environment: string, expected: string[]): Promise<CheckRow> {
	if (!impl.inspect) {
		return row(impl.providerName, "skip", "cannot list the variables without reading their values");
	}
	try {
		const found = await impl.inspect(environment);
		const problems = declaredVsActual(
			new Map(expected.map((name) => [name, true])),
			new Map(found.names.map((name) => [name, true])),
			{ noun: "variable", flagExtra: false }
		);
		const spelled =
			found.environment === environment
				? `"${found.environment}"`
				: `"${found.environment}" (the config writes "${environment}")`;
		return problems.length > 0
			? row(impl.providerName, "fail", `${spelled}: ${problems.length} problem(s)`, problems)
			: row(
					impl.providerName,
					"ok",
					`${spelled} has ${found.names.length} variable(s), ${expected.length} of ${expected.length} expected present`
				);
	} catch (err) {
		return row(impl.providerName, "fail", errorMessage(err));
	}
}

/** The `envName` of every token the configured plugins list, once each. A plugin that cannot be loaded lists none. */
async function expectedNames(input: RunDoctorCredentialsInput): Promise<string[]> {
	const importer = input.importer ?? defaultImporter;
	const names = new Set<string>();
	for (const pkg of configuredPackages(input)) {
		try {
			for (const token of (await importer(pkg)).tokens ?? []) names.add(token.envName);
		} catch {
			// `doctor tokens` reports a plugin that cannot be loaded; here it just lists nothing.
		}
	}
	return [...names].sort();
}
