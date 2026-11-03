/**
 * `holocron doctor credentials` — does the credentials environment exist, and does it hold the tokens the plugins take?
 *
 * Read-only, and it never reads a value: the providers are loaded without being asked for their variables, and each
 * one lists only the names (`Credentials.inspect`). The names expected are the `envName` of every token the configured
 * plugins list (their `tokens` export, the same list `doctor tokens` checks), except the ones a plugin marks `optional`
 * because it only falls back to them (the Discord webhook): those are not expected, and the row says when one is not
 * set. A name any plugin needs is expected even if another plugin lists it as optional. A variable the environment
 * lacks is a failure; one it has beyond those is not a problem. The row says which spelling of the environment's name matched,
 * since a provider that matches names exactly may find it under a different case than the config writes.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { credentialsEnvironment, type ResolvedProviderEntry } from "../../config/index.js";
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
	const rows: CheckRow[] = loader
		.loadFailures()
		.filter((f) => f.key === "credentials")
		.map((f) => row(f.provider, "fail", `failed to load: ${errorMessage(f.error)}`));
	if (!loader.has("credentials")) return rows;

	const expected = await expectedTokens(input);
	// `credentials` is a many-cardinality capability, so its entry always has a list of providers.
	const { tuples } = resolved.providers.credentials as Extract<ResolvedProviderEntry, { cardinality: "many" }>;
	for (const impl of loader.get("credentials") as Credentials[]) {
		const tuple = tuples.find((t) => t.provider === impl.providerName);
		const environment = tuple && credentialsEnvironment(tuple, resolved);
		rows.push(
			environment
				? await checkProvider(impl, environment, expected)
				: row(impl.providerName, "skip", "no `environment` option and `credentials.environment` is not set")
		);
	}
	return rows;
}

async function checkProvider(impl: Credentials, environment: string, expected: ExpectedTokens): Promise<CheckRow> {
	if (!impl.inspect) {
		return row(impl.providerName, "skip", "cannot list the variables without reading their values");
	}
	try {
		const found = await impl.inspect(environment);
		const problems = declaredVsActual(
			new Map(expected.required.map((name) => [name, true])),
			new Map(found.names.map((name) => [name, true])),
			{ noun: "variable", flagExtra: false }
		);
		// A token the plugin only falls back to is not expected, but the row says when it is not there.
		const absent = expected.optional.filter((name) => !found.names.includes(name));
		const optionalNote = absent.length > 0 ? `; optional, not set: ${absent.join(", ")}` : "";
		const spelled =
			found.environment === environment
				? `"${found.environment}"`
				: `"${found.environment}" (the config writes "${environment}")`;
		return problems.length > 0
			? row(impl.providerName, "fail", `${spelled}: ${problems.length} problem(s)${optionalNote}`, problems)
			: row(
					impl.providerName,
					"ok",
					`${spelled} has ${found.names.length} variable(s), ${expected.required.length} of ${expected.required.length} expected present${optionalNote}`
				);
	} catch (err) {
		return row(impl.providerName, "fail", errorMessage(err));
	}
}

/** The variable names the configured plugins take: those the environment must hold, and those it need not. */
interface ExpectedTokens {
	required: string[];
	optional: string[];
}

/**
 * The `envName` of every token the configured plugins list, once each, split into the ones expected and the ones a
 * plugin only falls back to (`optional`). A name any plugin needs is expected. A plugin that cannot be loaded lists none.
 */
async function expectedTokens(input: RunDoctorCredentialsInput): Promise<ExpectedTokens> {
	const importer = input.importer ?? defaultImporter;
	const optionalOnly = new Map<string, boolean>();
	for (const pkg of configuredPackages(input)) {
		try {
			for (const token of (await importer(pkg)).tokens ?? []) {
				optionalOnly.set(token.envName, (optionalOnly.get(token.envName) ?? true) && token.optional === true);
			}
		} catch {
			// `doctor tokens` reports a plugin that cannot be loaded; here it just lists nothing.
		}
	}
	const names = [...optionalOnly.keys()].sort();
	return {
		required: names.filter((name) => !optionalOnly.get(name)),
		optional: names.filter((name) => optionalOnly.get(name)),
	};
}
