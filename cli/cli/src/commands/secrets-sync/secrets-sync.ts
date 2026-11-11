/**
 * `holocron secrets sync` — vault → destinations.
 *
 * Reads a named environment from the configured `vault` (1P
 * Environment / similar) as KEY=VALUE pairs, then fans those values
 * out to the configured destinations:
 *
 *  - `secrets` capability (e.g., GH Actions secrets) — repo-scope
 *  - `deployment` capability (e.g., Vercel env vars) — per-target
 *  - local `.env` file (optional, planned for v5.1 — currently skipped
 *    with a soft "not yet" note)
 *
 * Per-secret routing rules:
 *
 *  - `deployment` (for each target the caller asks for, defaults: production + preview) and a Worker's secrets fail
 *    closed (#2061): they receive only the keys `repo.secrets.deploy` names for this environment (an exact `keys`
 *    list and/or a `prefix`), passed in as `deployFilter`. With none, the run throws a `ConfigError` before it reads
 *    the vault. A name outside the filter is reported by name only and never reaches the provider.
 *  - `secrets` (GH Actions) defaults to every key, repo-scoped — but a
 *    caller can pass `githubSecretKeys` (an allowlist, from repeatable
 *    `--github-secret KEY` CLI values) to restrict `secrets` to only
 *    those keys, and `githubSecretScope` (same `{ kind }` shape `secret
 *    set`'s own `--scope repo|env=NAME|org=NAME` parses to) to apply one
 *    scope to all of them. A key not in the allowlist is skipped for
 *    `secrets` entirely — still synced to `deployment` if configured.
 *    Needed for a vault holding a mix of deploy-only secrets and one
 *    CI-consumed, org-wide secret (holocron#781's Sentinel case: 4
 *    Vercel-only keys + one org-scoped Axiom ingest token
 *    `theholocron/.github`'s dispatched-check workflow also reads).
 *  - With no `--github-secret`, the routes come from `repo.secrets.sync`: every
 *    entry for this environment gives `secrets` its own keys and scope, one
 *    step per scope, so one environment can fill organization and repository
 *    secrets in one run.
 *  - `repo.variables.sync` entries for this environment give Actions variables: each key goes through the `source`
 *    provider's `syncVariables` (repo scope) or `syncOrgVariables`, one call per key, without pruning. An
 *    environment with only variable entries pushes nothing to `secrets` or `deployment`.
 *  - A key that is blank in the vault is skipped in every destination, and a
 *    listed key the vault does not hold is a skipped row.
 *
 * The vault MUST implement `readEnvironment(envId)` (optional method).
 * If it doesn't, the command errors with a hint to populate the keys
 * individually via `holocron new secret` (also planned for v5.1).
 */

import { ConfigError } from "@theholocron/kyber/config";
import { describeError, logReason, style, withSpinner } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";
import type { Logger } from "@theholocron/observability/core";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Deployment,
	type DeploymentTarget,
	PluginLoader,
	type Secrets,
	type SecretScope,
	type Source,
	type Vault,
	type Workers,
} from "../../plugin/index.js";
import type { DeployFilter } from "./deploy-filter/index.js";
import { githubNameProblem } from "./github-name/index.js";
import { restorePem } from "./restore-pem/index.js";
import type { RunSecretsSyncInput, SyncPrintLine, SyncReport, SyncRow, VariableRoute } from "./secrets-sync.type.js";
import { splitDeployKeys } from "./split-deploy-keys/index.js";

/** Why there is no `workers` provider: the plugin's own load error when it failed to load (e.g. a missing account id). */
function workersMissing(loader: PluginLoader): string {
	const base = "--worker needs a `workers` provider in holocron.config.ts";
	const failure = loader.loadFailures().find((f) => f.key === "workers");
	return failure ? `${base} (\`${failure.provider}\` failed to load: ${describeError(failure.error)})` : base;
}

export async function runSecretsSync(input: RunSecretsSyncInput): Promise<SyncReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await withSpinner("Loading plugins…", () => loader.load());
	assertPluginsResolvable(loader, "secrets sync");

	logger.info(
		{ environment: input.environmentId, dryRun: (input.context.dryRun ?? false) || undefined },
		"secrets sync: start"
	);

	const dryRun = input.context.dryRun ?? false;

	// An environment declared only for variables is not a deployment's: it would otherwise print a "projectId" skip.
	const variablesOnly =
		(input.variableRoutes?.length ?? 0) > 0 && input.secretRoutes?.length === 0 && !input.projectId;
	const wantsDeployment = loader.has("deployment") && !variablesOnly && Boolean(input.projectId);
	if ((wantsDeployment || input.workerScript) && !input.deployFilter) {
		// Fail closed, before anything is read: a deployment never gets every key (#2061).
		throw new ConfigError(
			`no \`repo.secrets.deploy\` entry for environment ${JSON.stringify(input.environmentId)}: a deployment or a Worker receives only the keys named by \`keys\` or \`prefix\`, never every key. Add { environment: ${JSON.stringify(input.environmentId)}, prefix: "<PREFIX>_" } (or keys: [...]) to repo.secrets.deploy`
		);
	}
	const targets = input.targets ?? (["production", "preview"] as DeploymentTarget[]);

	print(style.header(`Holocron secrets sync — environment ${input.environmentId}${dryRun ? " (dry-run)" : ""}`));
	print(style.dim(`  vault: ${vaultProviderName(loader)}`));
	print("");

	// ── Read the vault ─────────────────────────────────────────────────
	const vault = loader.get("vault") as Vault;
	if (!vault.readEnvironment) {
		throw new Error(
			`vault provider (${vault.providerName}) does not implement readEnvironment — sync needs bulk env reads`
		);
	}
	let envVars: Record<string, string>;
	try {
		envVars = await withSpinner(`Reading vault environment ${input.environmentId}…`, () =>
			vault.readEnvironment!(input.environmentId)
		);
	} catch (err) {
		// Printed, not just thrown: the CLI's global handler swallows a plain Error, so a bare throw exits 1 with no message.
		const message = describeError(err);
		print(`  ${style.fail(`could not read vault environment ${input.environmentId}: ${message}`)}`);
		logger.warn({ environment: input.environmentId, reason: logReason(err) }, "secrets sync: vault read failed");
		return summarise(
			[
				{
					destination: `vault:${vault.providerName}`,
					scope: `environment=${input.environmentId}`,
					key: "(all)",
					status: "fail",
					message,
				},
			],
			logger,
			print,
			dryRun
		);
	}
	const keys = Object.keys(envVars).sort();
	print(style.step(`read ${keys.length} keys from vault`));
	print("");
	const deploySplit = input.deployFilter ? splitDeployKeys(keys, input.deployFilter) : undefined;

	const rows: SyncRow[] = [];

	// ── Push to `secrets` (CI/Actions secrets) ─────────────────────────
	if (loader.has("secrets")) {
		const secrets = loader.get("secrets") as Secrets;
		const routes = input.secretRoutes ?? [
			{
				scope: input.githubSecretScope ?? { kind: "repo" },
				...(input.githubSecretKeys ? { keys: input.githubSecretKeys } : {}),
			},
		];
		for (const route of routes) {
			print(style.step(routes.length > 1 ? `secrets (${scopeLabel(route.scope)})` : "secrets"));
			// No allowlist → every key (original default). With one → only
			// the listed keys, in the order given; an unlisted vault key is
			// skipped for `secrets` entirely (still reaches `deployment`
			// below, if configured).
			for (const key of route.keys ?? keys) {
				rows.push(
					await pushRow(
						`secrets:${secrets.providerName}`,
						scopeLabel(route.scope),
						key,
						envVars,
						dryRun,
						async (value) => {
							await secrets.setSecret(route.scope, key, value);
						},
						nameCheck(secrets.providerName)
					)
				);
				print(formatRow(rows[rows.length - 1]!));
			}
		}
	}

	// ── Push to Actions variables (through `source`) ───────────────────
	// Variables are readable in GitHub afterwards, which is why they come from an environment of their own. Values go
	// through the same `pushRow()` as secrets: a blank is skipped, a dry run writes nothing, nothing is printed.
	const variableRoutes = input.variableRoutes ?? [];
	if (variableRoutes.length > 0) {
		const source = loader.has("source") ? (loader.get("source") as Source) : undefined;
		for (const route of variableRoutes) {
			const scope = scopeLabel(route.scope);
			print(style.step(`variables (${scope})`));
			const destination = `variables:${source?.providerName ?? "source"}`;
			const org = route.scope.kind === "organization" ? route.scope.name : undefined;
			const unsupported = !source
				? "needs a `source` provider in holocron.config.ts"
				: org === undefined && !source.syncVariables
					? `source provider (${source.providerName}) does not implement syncVariables`
					: org !== undefined && !source.syncOrgVariables
						? `source provider (${source.providerName}) does not implement syncOrgVariables`
						: undefined;
			if (unsupported) {
				const row: SyncRow = { destination, scope, key: "(all)", status: "fail", message: unsupported };
				rows.push(row);
				print(formatRow(row));
				continue;
			}
			for (const key of route.keys) {
				rows.push(
					await pushRow(
						destination,
						scope,
						key,
						envVars,
						dryRun,
						async (value) => {
							// One call per key: a failure is one row, and `prune` is off so nothing else is touched.
							if (org === undefined) await source!.syncVariables!({ [key]: value }, { prune: false });
							else {
								await source!.syncOrgVariables!(
									org,
									{ [key]: { value, visibility: route.visibility ?? "all" } },
									{ prune: false }
								);
							}
						},
						nameCheck(source!.providerName)
					)
				);
				print(formatRow(rows[rows.length - 1]!));
			}
		}
	}

	// ── Push to `deployment` (Vercel env vars) ─────────────────────────
	if (loader.has("deployment") && !variablesOnly) {
		const deploy = loader.get("deployment") as Deployment;
		if (!input.projectId) {
			print(style.step("deployment"));
			const row: SyncRow = {
				destination: `deployment:${deploy.providerName}`,
				scope: "no projectId",
				key: "(all)",
				status: "skip",
				message: "projectId required for deployment env-var sync (pass --project-id)",
			};
			rows.push(row);
			print(formatRow(row));
		} else {
			for (const target of targets) {
				print(style.step(`deployment (target=${target})`));
				const destination = `deployment:${deploy.providerName}`;
				reportFiltered(
					destination,
					`target=${target}`,
					deploySplit!.filtered,
					input.deployFilter!,
					rows,
					print
				);
				for (const key of deploySplit!.send) {
					rows.push(
						await pushRow(destination, `target=${target}`, key, envVars, dryRun, async (value) => {
							await deploy.setEnvVar(input.projectId!, target, key, value);
						})
					);
					print(formatRow(rows[rows.length - 1]!));
				}
			}
		}
	}

	// ── Push to a Worker's secret bindings ─────────────────────────────
	if (input.workerScript) {
		const script = input.workerScript;
		print(style.step(`workers (script=${script})`));
		const workers = loader.has("workers") ? (loader.get("workers") as Workers) : undefined;
		if (!workers?.setSecret) {
			const row: SyncRow = {
				destination: "workers",
				scope: `script=${script}`,
				key: "(all)",
				status: "fail",
				message: workers
					? `workers provider (${workers.providerName}) cannot set secrets`
					: workersMissing(loader),
			};
			rows.push(row);
			print(formatRow(row));
		} else {
			reportFiltered(
				`workers:${workers.providerName}`,
				`script=${script}`,
				deploySplit!.filtered,
				input.deployFilter!,
				rows,
				print
			);
			for (const key of deploySplit!.send) {
				rows.push(
					await pushRow(
						`workers:${workers.providerName}`,
						`script=${script}`,
						key,
						envVars,
						dryRun,
						async (value) => {
							await workers.setSecret!(script, key, value);
						}
					)
				);
				print(formatRow(rows[rows.length - 1]!));
			}
		}
	}

	return summarise(rows, logger, print, dryRun);
}

// ── helpers ──────────────────────────────────────────────────────────

/**
 * Record the vault keys a deployment or Worker filter left out: one skipped row each (names only; the value is never
 * read for them) and one line naming them all, so the dry run and the real run show what stayed behind.
 */
function reportFiltered(
	destination: string,
	scope: string,
	filtered: string[],
	filter: DeployFilter,
	rows: SyncRow[],
	print: SyncPrintLine
): void {
	const allowed = [...filter.prefixes.map((p) => `${p}*`), ...filter.keys].join(", ");
	for (const key of filtered) {
		rows.push({
			destination,
			scope,
			key,
			status: "skip",
			message: `filtered: not in repo.secrets.deploy (${allowed})`,
		});
	}
	if (filtered.length > 0)
		print(style.dim(`    · not sent (${filtered.length}, outside ${allowed}): ${filtered.join(", ")}`));
}

/** Log every row, then print and log the summary. Shared by a finished run and one that stopped at the vault. */
function summarise(rows: SyncRow[], logger: Logger, print: SyncPrintLine, dryRun: boolean): SyncReport {
	for (const r of rows) {
		// `key` is a secret NAME, never a value — safe to log. The logger also
		// redacts `secrets[*].value` shapes as defence in depth.
		logger[r.status === "fail" ? "warn" : "info"](
			{
				destination: r.destination,
				scope: r.scope,
				key: r.key,
				status: r.status,
				...(r.message ? { detail: r.message } : {}),
			},
			`secrets sync: ${r.key} → ${r.destination}`
		);
	}

	const summary = rows.reduce(
		(acc, r) => {
			if (r.status === "ok") acc.ok += 1;
			else if (r.status === "fail") acc.fail += 1;
			else if (r.status === "skip") acc.skip += 1;
			else if (r.status === "dry-run") acc.dryRun += 1;
			return acc;
		},
		{ ok: 0, fail: 0, skip: 0, dryRun: 0 }
	);

	logger[summary.fail > 0 ? "warn" : "info"]({ ...summary, keys: rows.length }, "secrets sync: done");

	print("");
	const summaryLine = `${summary.ok} ok, ${summary.fail} fail, ${summary.skip} skipped${
		dryRun ? `, ${summary.dryRun} would-do` : ""
	}`;
	print(summary.fail > 0 ? style.fail(summaryLine) : style.success(summaryLine));

	return { rows, summary };
}

/**
 * One key to one destination. A key the vault does not hold, or holds blank, is a skipped row: a blank is a placeholder
 * for a value still to be found, and pushing it would overwrite a working secret with nothing (which no provider can
 * read back to undo). Everything else goes through {@link runRow}.
 */
async function pushRow(
	destination: string,
	scope: string,
	key: string,
	envVars: Record<string, string>,
	dryRun: boolean,
	body: (value: string) => Promise<void>,
	nameProblem?: (key: string) => string | undefined
): Promise<SyncRow> {
	const problem = nameProblem?.(key);
	if (problem) return { destination, scope, key, status: "skip", message: `invalid name: ${problem}` };
	const value = Object.hasOwn(envVars, key) ? envVars[key]! : undefined;
	if (value === undefined) {
		return { destination, scope, key, status: "skip", message: "not in the vault environment" };
	}
	if (value.trim() === "") {
		return { destination, scope, key, status: "skip", message: "blank in the vault environment" };
	}
	// A PEM whose line breaks became spaces (pasted into a one-line vault field) is put back on its lines.
	return runRow(destination, scope, key, dryRun, () => body(restorePem(value)));
}

/** The name check for a destination: GitHub's rules when the provider is `github`, none for any other. */
function nameCheck(providerName: string): ((key: string) => string | undefined) | undefined {
	return providerName === "github" ? githubNameProblem : undefined;
}

async function runRow(
	destination: string,
	scope: string,
	key: string,
	dryRun: boolean,
	body: () => Promise<void>
): Promise<SyncRow> {
	if (dryRun) {
		return { destination, scope, key, status: "dry-run" };
	}
	try {
		await body();
		return { destination, scope, key, status: "ok" };
	} catch (err) {
		return {
			destination,
			scope,
			key,
			status: "fail",
			message: errorMessage(err),
		};
	}
}

function formatRow(row: SyncRow): string {
	const detail = row.message ? style.dim(`  (${row.message})`) : "";
	const label = `${row.key}${detail}`;
	if (row.status === "ok") return `    ${style.success(label)}`;
	if (row.status === "fail") return `    ${style.fail(label)}`;
	if (row.status === "dry-run") return `    ${style.dim(`… ${label}`)}`;
	return `    ${style.dim(`· ${label}`)}`;
}

function scopeLabel(scope: SecretScope | VariableRoute["scope"]): string {
	if (scope.kind === "repo") return "scope=repo";
	if (scope.kind === "organization") return `scope=organization,org=${scope.name}`;
	return `scope=environment,env=${scope.name}`;
}

function vaultProviderName(loader: PluginLoader): string {
	if (!loader.has("vault")) return "<missing>";
	return (loader.get("vault") as Vault).providerName;
}
