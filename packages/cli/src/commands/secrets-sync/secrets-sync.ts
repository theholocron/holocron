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
 *  - All keys go to `deployment` for each target the caller asks for
 *    (defaults: production + preview)
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
 *
 * The vault MUST implement `readEnvironment(envId)` (optional method).
 * If it doesn't, the command errors with a hint to populate the keys
 * individually via `holocron secrets set` (also planned for v5.1).
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Deployment,
	type DeploymentTarget,
	PluginLoader,
	type Secrets,
	type SecretScope,
	type Vault,
	type Workers,
} from "../../plugin/index.js";
import { style, withSpinner } from "../../ui/index.js";
import { describeProviderError, logReason } from "../../ui/provider-error/index.js";
import type { RunSecretsSyncInput, SyncReport, SyncRow } from "./secrets-sync.type.js";

/** Why there is no `workers` provider: the plugin's own load error when it failed to load (e.g. a missing account id). */
function workersMissing(loader: PluginLoader): string {
	const base = "--worker needs a `workers` provider in holocron.config.ts";
	const failure = loader.loadFailures().find((f) => f.key === "workers");
	return failure ? `${base} (\`${failure.provider}\` failed to load: ${describeProviderError(failure.error)})` : base;
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
		const message = describeProviderError(err);
		print(`  ${style.fail(`could not read vault environment ${input.environmentId}: ${message}`)}`);
		logger.warn({ environment: input.environmentId, reason: logReason(err) }, "secrets sync: vault read failed");
		return {
			rows: [
				{
					destination: `vault:${vault.providerName}`,
					scope: `environment=${input.environmentId}`,
					key: "(all)",
					status: "fail",
					message,
				},
			],
			summary: { ok: 0, fail: 1, skip: 0, dryRun: 0 },
		};
	}
	const keys = Object.keys(envVars).sort();
	print(style.step(`read ${keys.length} keys from vault`));
	print("");

	const rows: SyncRow[] = [];

	// ── Push to `secrets` (CI/Actions secrets) ─────────────────────────
	if (loader.has("secrets")) {
		const secrets = loader.get("secrets") as Secrets;
		const scope = input.githubSecretScope ?? { kind: "repo" };
		const allowedKeys = input.githubSecretKeys ? new Set(input.githubSecretKeys) : undefined;
		print(style.step("secrets"));
		for (const key of keys) {
			// No allowlist → every key (original default). With one → only
			// listed keys; an unlisted key is skipped for `secrets` entirely
			// (still reaches `deployment` above, if configured).
			if (allowedKeys && !allowedKeys.has(key)) continue;

			rows.push(
				await runRow(`secrets:${secrets.providerName}`, scopeLabel(scope), key, dryRun, async () => {
					await secrets.setSecret(scope, key, envVars[key]!);
				})
			);
			print(formatRow(rows[rows.length - 1]!));
		}
	}

	// ── Push to `deployment` (Vercel env vars) ─────────────────────────
	if (loader.has("deployment")) {
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
				for (const key of keys) {
					rows.push(
						await runRow(`deployment:${deploy.providerName}`, `target=${target}`, key, dryRun, async () => {
							await deploy.setEnvVar(input.projectId!, target, key, envVars[key]!);
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
			for (const key of keys) {
				rows.push(
					await runRow(`workers:${workers.providerName}`, `script=${script}`, key, dryRun, async () => {
						await workers.setSecret!(script, key, envVars[key]!);
					})
				);
				print(formatRow(rows[rows.length - 1]!));
			}
		}
	}

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

// ── helpers ──────────────────────────────────────────────────────────

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

function scopeLabel(scope: SecretScope): string {
	if (scope.kind === "repo") return "scope=repo";
	if (scope.kind === "organization") return `scope=organization,org=${scope.name}`;
	return `scope=environment,env=${scope.name}`;
}

function vaultProviderName(loader: PluginLoader): string {
	if (!loader.has("vault")) return "<missing>";
	return (loader.get("vault") as Vault).providerName;
}
