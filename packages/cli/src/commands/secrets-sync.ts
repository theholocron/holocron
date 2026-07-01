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
 *  - All keys go to `secrets` (CI needs them)
 *  - All keys go to `deployment` for each target the caller asks for
 *    (defaults: production + preview)
 *
 * The vault MUST implement `readEnvironment(envId)` (optional method).
 * If it doesn't, the command errors with a hint to populate the keys
 * individually via `holocron secret set` (also planned for v5.1).
 */

import type { Deployment, DeploymentTarget, Secrets, Vault } from "../capabilities/index.js";
import type { LoadedConfig } from "../load-config.js";
import { PluginLoader, type RuntimeContext } from "../loader.js";

export type SyncPrintLine = (line: string) => void;

export type SyncRowStatus = "ok" | "fail" | "dry-run" | "skip";

export interface SyncRow {
	destination: string;
	/** e.g., `target=production` for deployment, `scope=repo` for secrets. */
	scope: string;
	key: string;
	status: SyncRowStatus;
	message?: string;
}

export interface SyncReport {
	rows: SyncRow[];
	summary: { ok: number; fail: number; skip: number; dryRun: number };
}

export interface RunSecretsSyncInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Vault environment id to read. */
	environmentId: string;
	/** Deployment targets to sync to. Defaults to ['production', 'preview']. */
	targets?: DeploymentTarget[];
	/** Vercel project id (or equivalent). Required if `deployment` is loaded. */
	projectId?: string;
	loader?: PluginLoader;
	print?: SyncPrintLine;
}

export async function runSecretsSync(input: RunSecretsSyncInput): Promise<SyncReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();

	const dryRun = input.context.dryRun ?? false;
	const targets = input.targets ?? (["production", "preview"] as DeploymentTarget[]);

	print(`Holocron secrets sync — environment ${input.environmentId}${dryRun ? " (dry-run)" : ""}`);
	print(`  vault: ${vaultProviderName(loader)}`);
	print("");

	// ── Read the vault ─────────────────────────────────────────────────
	const vault = loader.get("vault") as Vault;
	if (!vault.readEnvironment) {
		throw new Error(
			`vault provider (${vault.providerName}) does not implement readEnvironment — sync needs bulk env reads`
		);
	}
	const envVars = await vault.readEnvironment(input.environmentId);
	const keys = Object.keys(envVars).sort();
	print(`  → read ${keys.length} keys from vault`);
	print("");

	const rows: SyncRow[] = [];

	// ── Push to `secrets` (CI/Actions secrets) ─────────────────────────
	if (loader.has("secrets")) {
		const secrets = loader.get("secrets") as Secrets;
		print("  → secrets (repo scope)");
		for (const key of keys) {
			rows.push(
				await runRow(`secrets:${secrets.providerName}`, "scope=repo", key, dryRun, async () => {
					await secrets.setSecret({ kind: "repo" }, key, envVars[key]!);
				})
			);
			print(formatRow(rows[rows.length - 1]!));
		}
	}

	// ── Push to `deployment` (Vercel env vars) ─────────────────────────
	if (loader.has("deployment")) {
		const deploy = loader.get("deployment") as Deployment;
		if (!input.projectId) {
			print("  → deployment");
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
				print(`  → deployment (target=${target})`);
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

	print("");
	print(
		`  ${summary.ok} ok, ${summary.fail} fail, ${summary.skip} skipped${
			dryRun ? `, ${summary.dryRun} would-do` : ""
		}`
	);

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
			message: err instanceof Error ? err.message : String(err),
		};
	}
}

function formatRow(row: SyncRow): string {
	const icon = row.status === "ok" ? "✓" : row.status === "fail" ? "✗" : row.status === "dry-run" ? "…" : "·";
	const detail = row.message ? `  (${row.message})` : "";
	return `    ${icon} ${row.key}${detail}`;
}

function vaultProviderName(loader: PluginLoader): string {
	if (!loader.has("vault")) return "<missing>";
	return (loader.get("vault") as Vault).providerName;
}
