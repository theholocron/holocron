/**
 * `holocron doctor secrets` — do the secrets the config says must exist, exist?
 *
 * Read-only, names only: GitHub never returns a value. One row for the repository's secrets, one for the
 * organization's and one per environment, each only when the config expects something there (see
 * {@link expectedSecrets}). A secret that exists but is not expected is never a problem. A scope that cannot be
 * read because there is no provider, or no token for it, is a skip with the reason, not a failure.
 *
 * `input.environments` (`--env`) limits the run: `ci` is the GitHub side (`repo.secrets.sync` and the declared
 * names), `prod` the `repo.secrets.deploy` destinations; `local`, `dev` and `test` are skipped rows that say why.
 */

import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { ENVIRONMENT_LAYERS } from "../../credentials-environments/index.js";
import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type Vault, WorkspaceContextError } from "../../plugin/index.js";
import { whyMissing } from "../notifications-channel-add/index.js";
import { ciRows } from "./ci-rows.js";
import { credentialsRows } from "./credentials-rows.js";
import { deployKeyRows } from "./deploy-key-rows.js";
import type {
	DoctorEnvironment,
	DoctorSecretsReport,
	Matrix,
	MatrixPlace,
	RunDoctorSecretsInput,
} from "./doctor-secrets.type.js";
import { environmentSkipRow } from "./environment-skip-row.js";
import { buildMatrix } from "./matrix-build.js";
import { explainName } from "./matrix-explain.js";
import { matrixPlaces } from "./matrix-places.js";
import { renderMatrix } from "./matrix-render.js";
import { matrixRows } from "./matrix-rows.js";
import { memoVault } from "./memo-vault.js";
import { sharedRows } from "./shared-rows.js";
import { variableRows } from "./variable-rows.js";
import { verifyRows } from "./verify-rows.js";

export async function runDoctorSecrets(input: RunDoctorSecretsInput): Promise<DoctorSecretsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	// `ci` (GitHub, from `repo.secrets.sync`) and `prod` (the `repo.secrets.deploy` destinations) have rows of their own;
	// the others are a skipped row that says why. With no `--env`, the two that have rows run and nothing else is listed.
	const only = input.environments;
	const wants = (env: DoctorEnvironment) => only === undefined || only.includes(env);
	const skipRow = (env: DoctorEnvironment): CheckRow[] => {
		const row = only?.includes(env) ? environmentSkipRow(env) : undefined;
		return row ? [row] : [];
	};

	const rows: CheckRow[] = [];
	const places: MatrixPlace[] = [];
	const config = input.loaded.resolved;
	const manual = config.doctor.manualSecrets ?? [];
	const withSecrets = input.only !== "variables";
	const withVariables = input.only !== "secrets";
	let ran = false;
	const notes: string[] = [];
	const vaultOf = (loader: PluginLoader): Vault | { why: string } =>
		loader.has("vault")
			? (loader.get("vault") as Vault)
			: { why: whyMissing(loader, "vault", "no `vault` provider to list the environment's keys with") };
	// The plugins are loaded once, the first time a part needs them (this also fills the credential store).
	let loading: Promise<PluginLoader> | undefined;
	const getLoader = () =>
		(loading ??= (async () => {
			const loader = input.loader ?? new PluginLoader(config, input.context);
			await loader.load();
			assertPluginsResolvable(loader, "doctor secrets");
			return loader;
		})());

	// `local` and `dev`: what the machine's credentials Environments hold against the tokens the plugins take.
	if ((wants("local") || wants("dev")) && withSecrets) {
		ran = true;
		const credentialsLoader =
			input.credentialsLoader ?? new PluginLoader(config, input.context, undefined, { readCredentials: false });
		await credentialsLoader.load();
		assertPluginsResolvable(credentialsLoader, "doctor secrets");
		const credentials = await credentialsRows({
			loaded: input.loaded,
			context: input.context,
			loader: credentialsLoader,
			...(input.importer ? { importer: input.importer } : {}),
			...(input.gitExec ? { gitExec: input.gitExec } : {}),
			wants,
			asked: only !== undefined,
		});
		rows.push(...credentials.rows);
		places.push(...credentials.places);
	}

	if (wants("ci") || wants("prod")) {
		ran = true;
		const loader = await getLoader();
		const provider = vaultOf(loader);
		// Each Environment is read once, however many rows and columns ask about it.
		const vault = "why" in provider ? provider : memoVault(provider);
		const org = input.context.org ?? (input.context.repo ?? config.repo?.name ?? "").split("/")[0];

		const none = { declared: false, rows: [] as CheckRow[], observations: [] };
		const ci = wants("ci") && withSecrets ? await ciRows(loader, config, vault, org) : none;
		const variables = wants("ci") && withVariables ? await variableRows(loader, config, org) : none;
		// What `repo.secrets.deploy` lets a deployment or Worker receive: names only, shown before a sync (#2061).
		const deployRows =
			wants("prod") && withSecrets ? await deployKeyRows(config.repo?.secrets?.deploy ?? [], vault) : [];
		if (!ci.declared && !variables.declared && deployRows.length === 0) {
			rows.push({ id: "secrets", title: "secrets", status: "ok", detail: "none declared", problems: [] });
		}
		rows.push(...ci.rows, ...variables.rows, ...skipRow("test"), ...deployRows);
		places.push(
			...(await matrixPlaces({
				config,
				vault,
				secrets: ci.observations,
				variables: variables.observations,
				org,
				wants,
			}))
		);
	} else {
		rows.push(...skipRow("test"));
	}

	// `--verify`: ask each vendor whether the tokens the plugins take are still accepted. The only part that goes online.
	if (input.verify) {
		ran = true;
		try {
			const loader = await getLoader();
			rows.push(
				...(await verifyRows({
					loaded: input.loaded,
					loader: { load: async () => undefined, loadFailures: () => loader.loadFailures() },
					...(input.importer ? { importer: input.importer } : {}),
					...(input.processEnv ? { env: input.processEnv } : {}),
					...(input.keyring ? { keyring: input.keyring } : {}),
					...(input.now ? { now: input.now } : {}),
				}))
			);
		} catch (err) {
			if (err instanceof WorkspaceContextError) throw err;
			rows.push({
				id: "verify:credentials",
				title: "verify credentials",
				status: "skip",
				detail: `could not load the credentials providers: ${errorMessage(err)}`,
				problems: [],
			});
		}
	}

	// `--shared`: do two layers hold the same value of a secret? Compares by a per-run salted hash, in memory.
	if (input.shared) {
		ran = true;
		const layers = ENVIRONMENT_LAYERS.filter((layer) => wants(layer));
		if (layers.length < 2) {
			rows.push({
				id: "shared:layers",
				title: "compare the layers",
				status: "skip",
				detail: "--shared needs two or more of local, dev, ci and prod in --env",
				problems: [],
			});
		} else {
			const shared = await sharedRows({
				loaded: input.loaded,
				context: input.context,
				vault: vaultOf(await getLoader()),
				...(input.gitExec ? { gitExec: input.gitExec } : {}),
				layers,
				strict: input.strict === true,
				allow: input.allow ?? [],
			});
			rows.push(...shared.rows);
			notes.push(shared.note);
		}
	}

	let matrix: Matrix | undefined;
	if (ran) {
		matrix = buildMatrix(
			places.filter(
				(place) => input.only === undefined || place.kind === (input.only === "secrets" ? "secret" : "variable")
			),
			manual
		);
		if (input.name === undefined) rows.push(...matrixRows(matrix, manual, input.strict === true));
	}

	// `--name` is a lookup: it says how each place stands for one name and changes the exit status for nothing.
	if (input.name !== undefined) {
		for (const line of matrix
			? explainName(matrix, input.name, manual)
			: [`${input.name}: no environment was read`]) {
			print(line);
		}
		return { status: "ok", rows: [], summary: { ok: 0, fail: 0, skip: 0 } };
	}

	if (matrix && matrix.places.length > 0) {
		const width = input.width ?? process.stdout.columns ?? 100;
		for (const line of renderMatrix(matrix, width, input.only)) print(line);
		print("");
	}
	printCheckRows(rows, print);
	for (const note of notes) print(note);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor secrets");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: rows.map((r) => r.detail).join("; ") } : {}),
	};
}
