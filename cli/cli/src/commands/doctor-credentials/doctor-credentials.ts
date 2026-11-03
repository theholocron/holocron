/**
 * `holocron doctor credentials` — does the credentials environment exist, and does it hold the tokens the plugins take?
 *
 * Read-only, and it never reads a value: the providers are loaded without being asked for their variables, and each
 * one lists only the names (`Credentials.inspect`). The names expected are the `envName` of every token the configured
 * plugins list (their `tokens` export, the same list `doctor tokens` checks). There is one row per variable, in plain
 * code-unit order so the output is the same on every machine: `ok` when the environment holds it, `fail` when it lacks
 * one a plugin needs, and `skip` when it lacks one a plugin only falls back to (`optional`, the Discord webhook). A
 * name any plugin needs is expected even if another plugin lists it as optional. A variable the environment holds
 * beyond those gets no row. Each row names the provider and the environment, and says which spelling of the
 * environment's name matched, since a provider that matches names exactly may find it under a different case than the
 * config writes. A provider that is missing, cannot list names or cannot find the environment gets one row of its own.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { credentialsEnvironment, type ResolvedProviderEntry } from "../../config/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, type Credentials, PluginLoader } from "../../plugin/index.js";
import { defaultImporter } from "../auth/index.js";
import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "../doctor-checks/index.js";
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

/** A row for the provider as a whole, or for one of its variables when `name` is given. */
function row(provider: string, status: CheckRow["status"], detail: string, name?: string): CheckRow {
	return name === undefined
		? { id: provider, title: provider, status, detail, problems: [] }
		: { id: `${provider}:${name}`, title: `${provider}: ${name}`, status, detail, problems: [] };
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
			...(environment
				? await checkProvider(impl, environment, expected)
				: [row(impl.providerName, "skip", "no `environment` option and `credentials.environment` is not set")])
		);
	}
	return rows;
}

async function checkProvider(impl: Credentials, environment: string, expected: ExpectedToken[]): Promise<CheckRow[]> {
	const provider = impl.providerName;
	if (!impl.inspect) {
		return [row(provider, "skip", "cannot list the variables without reading their values")];
	}
	if (expected.length === 0) {
		return [row(provider, "skip", "no configured plugin lists the tokens it takes")];
	}
	try {
		const found = await impl.inspect(environment);
		const held = new Set(found.names);
		const where =
			found.environment === environment
				? `"${found.environment}"`
				: `"${found.environment}" (the config writes "${environment}")`;
		return expected.map(({ name, optional }) => {
			if (held.has(name)) return row(provider, "ok", `present in ${where}`, name);
			return optional
				? row(provider, "skip", `optional, not set in ${where}`, name)
				: row(provider, "fail", `missing from ${where}`, name);
		});
	} catch (err) {
		return [row(provider, "fail", errorMessage(err))];
	}
}

/** One variable name the configured plugins take, and whether every plugin that lists it only falls back to it. */
interface ExpectedToken {
	name: string;
	optional: boolean;
}

/**
 * The `envName` of every token the configured plugins list, once each, in plain code-unit order. A name any plugin
 * needs is not `optional`. A plugin that cannot be loaded lists none.
 */
async function expectedTokens(input: RunDoctorCredentialsInput): Promise<ExpectedToken[]> {
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
	return [...optionalOnly.keys()].sort().map((name) => ({ name, optional: optionalOnly.get(name) === true }));
}
