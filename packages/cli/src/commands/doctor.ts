/**
 * `holocron doctor` — load the config, instantiate every capability,
 * print a per-capability readiness report.
 *
 * Each capability gets a smoke check appropriate to its surface:
 *   source   → `whoami()`
 *   issues   → `doctor()` (rich report)
 *   secrets  → `listSecrets({ kind: 'repo' })`
 *   ci       → `listRuns({ limit: 1 })`
 *   others   → just "loaded" (no smoke endpoint defined yet)
 *
 * Output is plain text via a passed-in `print` function so tests can
 * capture lines without ANSI / spinner noise.
 */

import type { Auth, Ci, Issues, Secrets, Source, Vault } from "../capabilities/index.js";
import { CARDINALITY } from "../capabilities/index.js";
import type { LoadedConfig } from "../load-config.js";
import { PluginLoader, type RuntimeContext } from "../loader.js";

export type DoctorPrintLine = (line: string) => void;

export type DoctorStatus = "ok" | "fail" | "skip";

export interface DoctorRow {
	capability: string;
	provider: string;
	status: DoctorStatus;
	message: string;
}

export interface DoctorReport {
	rows: DoctorRow[];
	summary: { ok: number; fail: number; skip: number };
}

export interface RunDoctorInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Lets tests inject mock plugins; defaults to native dynamic import. */
	loader?: PluginLoader;
	print?: DoctorPrintLine;
}

export async function runDoctor(input: RunDoctorInput): Promise<DoctorReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();

	const rows: DoctorRow[] = [];
	const config = input.loaded.resolved;

	print(`Holocron doctor — ${config.name}`);
	print(`  config: ${input.loaded.filepath}`);
	print("");

	for (const key of loader.loadedKeys()) {
		const cardinality = CARDINALITY[key];
		const entry = config.providers[key];
		const providers =
			entry?.cardinality === "many"
				? entry.tuples.map((t) => t.provider)
				: entry?.cardinality === "single"
					? [entry.tuple.provider]
					: [];

		if (cardinality === "many") {
			const impls = loader.get(key) as unknown as unknown[];
			impls.forEach((_impl, idx) => {
				rows.push({
					capability: key,
					provider: providers[idx] ?? "?",
					status: "skip",
					message: "loaded (no smoke check defined for this capability)",
				});
			});
		} else {
			const impl = loader.get(key) as unknown;
			const row = await smokeCheck(key, providers[0] ?? "?", impl);
			rows.push(row);
		}
	}

	// Render rows
	for (const row of rows) {
		const icon = row.status === "ok" ? "✓" : row.status === "fail" ? "✗" : "·";
		print(`  ${icon} ${pad(row.capability, 14)} via ${pad(row.provider, 14)}  ${row.message}`);
	}

	const summary = rows.reduce(
		(acc, r) => {
			acc[r.status] += 1;
			return acc;
		},
		{ ok: 0, fail: 0, skip: 0 }
	);

	print("");
	print(`  ${summary.ok} ok, ${summary.fail} fail, ${summary.skip} skipped`);

	return { rows, summary };
}

// ── smoke checks ────────────────────────────────────────────────────

async function smokeCheck(key: string, provider: string, impl: unknown): Promise<DoctorRow> {
	try {
		switch (key) {
			case "source": {
				const result = await (impl as Source).whoami();
				return mk(key, provider, "ok", `whoami: ${result.login}`);
			}
			case "issues": {
				const report = await (impl as Issues).doctor();
				return mk(
					key,
					provider,
					"ok",
					`${report.authedAs} / ${report.projectLabel} (${countResolvedLifecycle(report)})`
				);
			}
			case "secrets": {
				const names = await (impl as Secrets).listSecrets({ kind: "repo" });
				return mk(key, provider, "ok", `repo secrets: ${names.length} configured`);
			}
			case "ci": {
				const runs = await (impl as Ci).listRuns({ limit: 1 });
				return mk(
					key,
					provider,
					"ok",
					runs.length === 0 ? "no recent runs" : `most recent: ${runs[0]!.workflowName} (${runs[0]!.status})`
				);
			}
			case "vault": {
				const keys = await (impl as Vault).list();
				return mk(key, provider, "ok", `${keys.length} keys available`);
			}
			case "auth": {
				const desc = await (impl as Auth).describe();
				return mk(key, provider, "ok", `provider: ${desc.provider}; env keys: ${desc.envKeys.join(", ")}`);
			}
			default:
				return mk(key, provider, "skip", "loaded (no smoke check defined for this capability)");
		}
	} catch (err) {
		return mk(key, provider, "fail", err instanceof Error ? err.message : String(err));
	}
}

function countResolvedLifecycle(report: Awaited<ReturnType<Issues["doctor"]>>): string {
	const resolved = report.lifecycle.filter((l) => l.resolved).length;
	return `${resolved}/${report.lifecycle.length} lifecycle slots ready`;
}

function mk(capability: string, provider: string, status: DoctorStatus, message: string): DoctorRow {
	return { capability, provider, status, message };
}

function pad(s: string, width: number): string {
	return s.length >= width ? s : s + " ".repeat(width - s.length);
}
