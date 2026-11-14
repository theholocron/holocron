/**
 * The `local` and `dev` side of `holocron doctor secrets`: does the credentials environment exist, and does it hold the
 * tokens the plugins take?
 *
 * Read-only, and it never reads a value: the providers are loaded without being asked for their variables, and each
 * one lists only the names (`Credentials.inspect`). The names expected are the `envName` of every token the configured
 * plugins list (their `tokens` export). A machine reads `<org/repo> - local` and then `- dev`, so a name counts as
 * present when either holds it (the first found wins), whichever of the two is asked about here. A required Environment
 * that does not exist is a failing row of its own, by name; a missing `- local` is not mentioned. A token a plugin
 * needs that neither holds is a failing row; one a plugin only falls back to (`optional`, the Discord webhook) is a
 * skipped row. The rest is one `ok` row per provider. A provider that is missing, cannot list names or cannot find the
 * environment gets one row of its own. The places come back for the matrix.
 */

import type { GitExec } from "@theholocron/git-utils";
import type { CheckRow } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { credentialsEnvironment, type ResolvedProviderEntry } from "../../config/index.js";
import {
	derivesEnvironment,
	type EnvironmentCandidate,
	resolveEnvironments,
	tryEnvironments,
} from "../../credentials-environments/index.js";
import { type Credentials, type PluginLoader } from "../../plugin/index.js";
import type { AuthImporter } from "../auth/index.js";
import type {
	CredentialsRowsResult,
	DoctorEnvironment,
	ExpectedToken,
	MatrixPlace,
	RunDoctorSecretsInput,
} from "./doctor-secrets.type.js";
import { expectedTokens } from "./expected-tokens.js";
import { labelOf, layerOf, providerGroup } from "./matrix-names.js";

/** What `credentialsRows()` needs. */
export interface CredentialsRowsInput {
	/** The loaded config: `credentials.environment`, the `credentials` providers and the plugins whose tokens are expected. */
	loaded: RunDoctorSecretsInput["loaded"];
	/** The runtime context: `repoRoot` is where the `origin` remote is read. */
	context: RunDoctorSecretsInput["context"];
	/** A loader that does not read the providers' values. */
	loader: PluginLoader;
	/** Loads a plugin package for its `tokens`. */
	importer?: AuthImporter;
	/** Replaces the `git` call that reads the repo's `origin`, for tests. */
	gitExec?: GitExec;
	/** Whether an environment is being checked, so only its places come back. */
	wants: (env: DoctorEnvironment) => boolean;
	/** `--env` named `local` or `dev`: say so when there is no `credentials` provider, instead of staying quiet. */
	asked: boolean;
}

/** A row for the provider as a whole, or for one of its variables when `name` is given. */
function row(provider: string, status: CheckRow["status"], detail: string, name?: string): CheckRow {
	return name === undefined
		? { id: provider, title: provider, status, detail, problems: [] }
		: { id: `${provider}:${name}`, title: `${provider}: ${name}`, status, detail, problems: [] };
}

/**
 * Compares the tokens the plugins take with what the credentials providers hold, and returns the rows and the places for
 * the matrix's `local` and `dev` columns. Never throws for a provider that cannot be read: that is a row.
 *
 * @param input - The config, the loader and what to show.
 */
export async function credentialsRows(input: CredentialsRowsInput): Promise<CredentialsRowsResult> {
	const { loader } = input;
	const { resolved } = input.loaded;
	if (!resolved.providers.credentials) {
		return {
			rows: input.asked ? [row("credentials", "skip", "no `credentials` provider is configured")] : [],
			places: [],
		};
	}
	const rows: CheckRow[] = loader
		.loadFailures()
		.filter((f) => f.key === "credentials")
		.map((f) => row(f.provider, "fail", `failed to load: ${errorMessage(f.error)}`));
	const places: MatrixPlace[] = [];
	if (!loader.has("credentials")) return { rows, places };

	const expected = await expectedTokens(input);
	// `credentials` is a many-cardinality capability, so its entry always has a list of providers.
	const { tuples } = resolved.providers.credentials as Extract<ResolvedProviderEntry, { cardinality: "many" }>;
	for (const impl of loader.get("credentials") as Credentials[]) {
		const tuple = tuples.find((t) => t.provider === impl.providerName);
		const explicit = tuple && credentialsEnvironment(tuple, resolved);
		if (!explicit && !derivesEnvironment(impl.providerName)) {
			rows.push(
				row(impl.providerName, "skip", "no `environment` option and `credentials.environment` is not set")
			);
			continue;
		}
		try {
			// A machine reads `- local` then `- dev`: ask for that layer, whatever layer this run is in.
			const candidates = await resolveEnvironments(impl.providerName, explicit, {
				repoRoot: input.context.repoRoot,
				env: { HOLOCRON_ENVIRONMENT: "local" },
				...(input.gitExec ? { gitExec: input.gitExec } : {}),
			});
			const checked = await checkProvider(impl, candidates, expected);
			rows.push(...checked.rows);
			places.push(...checked.places);
		} catch (err) {
			rows.push(row(impl.providerName, "fail", errorMessage(err)));
		}
	}
	return { rows, places: places.filter((p) => input.wants(p.column.env)) };
}

/**
 * One row per problem and one `ok` row, against the Environments the layer reads. A variable counts as present when any
 * Environment found holds it (the first found wins, as in the credential store). A required Environment that does not
 * exist is a failing row of its own, by name, and an unreadable place for the matrix; a missing `- local` is not mentioned.
 */
async function checkProvider(
	impl: Credentials,
	candidates: EnvironmentCandidate[],
	expected: ExpectedToken[]
): Promise<CredentialsRowsResult> {
	const provider = impl.providerName;
	if (!impl.inspect) {
		return { rows: [row(provider, "skip", "cannot list the variables without reading their values")], places: [] };
	}
	if (expected.length === 0) {
		return { rows: [row(provider, "skip", "no configured plugin lists the tokens it takes")], places: [] };
	}
	const inspect = impl.inspect.bind(impl);
	try {
		const { found, missing } = await tryEnvironments(candidates, inspect);
		const rows: CheckRow[] = missing.map((name) =>
			row(provider, "fail", `${provider} has no Environment named "${name}"`)
		);
		const group = providerGroup(provider);
		const unreadPlaces: MatrixPlace[] = missing.map((name) => ({
			column: {
				id: `vault:${name}`,
				group,
				label: labelOf(name),
				env: layerFor(name),
				reportedElsewhere: true,
				unreadReported: true,
			},
			kind: "secret",
			needed: [],
			unread: `${provider} has no Environment named "${name}"`,
		}));
		if (found.length === 0) return { rows, places: unreadPlaces };

		const labels = found.map(({ name, result }) =>
			result.environment === name ? `"${name}"` : `"${result.environment}" (the config writes "${name}")`
		);
		const where = labels.join(", ");
		const have = (name: string) => found.some((f) => f.result.names.includes(name));
		let present = 0;
		for (const { name, optional } of expected) {
			if (have(name)) present++;
			else if (optional) rows.push(row(provider, "skip", `optional, not set in ${where}`, name));
			else rows.push(row(provider, "fail", `missing from ${where}`, name));
		}
		if (present > 0) {
			rows.push(row(provider, "ok", `${present} of ${expected.length} tokens present in ${where}`, "tokens"));
		}

		// The last Environment found is the one a machine must have, so a required token neither holds is missing there.
		const names = new Set(expected.map((e) => e.name));
		const places: MatrixPlace[] = [];
		const missingRequired = expected.filter((e) => !e.optional && !have(e.name)).map((e) => e.name);
		found.forEach(({ name, result }, index) => {
			places.push({
				column: {
					id: `vault:${name}`,
					group,
					label: labelOf(name),
					env: layerFor(name),
					reportedElsewhere: true,
					unreadReported: true,
				},
				kind: "secret",
				// A token held here is expected here; the Environment a machine must have also expects what is missing.
				needed: [
					...result.names.filter((n) => names.has(n)),
					...(index === found.length - 1 ? missingRequired : []),
				],
				present: result.names,
				reasons: Object.fromEntries(
					expected.map((e) => [
						e.name.toUpperCase(),
						`a token the configured plugins take${e.optional ? " (optional)" : ""}`,
					])
				),
			});
		});
		return { rows, places: [...places, ...unreadPlaces] };
	} catch (err) {
		return { rows: [row(provider, "fail", errorMessage(err))], places: [] };
	}
}

/** The layer a credentials Environment belongs to: `local` for `- local` or a name that is not a layer's, else `dev`. */
function layerFor(name: string): "local" | "dev" {
	return layerOf(name, "local") === "dev" ? "dev" : "local";
}
