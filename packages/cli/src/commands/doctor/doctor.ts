/**
 * `holocron doctor` — load the config, instantiate every capability,
 * print a per-capability readiness report.
 *
 * Each capability gets a smoke check appropriate to its surface:
 *   source   → `whoami()`
 *   issues   → `doctor()` (rich report)
 *   secrets  → `listSecrets({ kind: 'repo' })`
 *   ci       → `listRuns({ limit: 1 })`
 *   auth     → `whoami()` (required on every provider)
 *   errors   → `whoami()` (org reachability) or `describe()`
 *   logs     → `whoami()` (dataset reachability) or `describe()`
 *   others   → just "loaded" (no smoke endpoint defined yet)
 *
 * Output is plain text via a passed-in `print` function so tests can
 * capture lines without ANSI / spinner noise.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type Auth,
	CARDINALITY,
	type Ci,
	type Deployment,
	type Dns,
	type Environments,
	type Errors,
	type Issues,
	type Logs,
	type Monitoring,
	PluginLoader,
	type Secrets,
	type Source,
	type Vault,
	type Workers,
} from "../../plugin/index.js";
import { pad, statusRow, style, withSpinner } from "../../ui/index.js";
import type { DoctorReport, DoctorRow, DoctorStatus, RunDoctorInput } from "./doctor.type.js";

export async function runDoctor(input: RunDoctorInput): Promise<DoctorReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await withSpinner("Loading plugins…", () => loader.load());
	// A global install has no plugin packages to resolve — say so plainly
	// instead of printing a report that's all "Cannot find package" rows.
	assertPluginsResolvable(loader, "doctor");

	const rows: DoctorRow[] = [];
	const config = input.loaded.resolved;

	print("");
	print(style.dim(`  config: ${input.loaded.filepath}`));
	print("");

	// Providers that never loaded (missing token, package not installed) —
	// the most actionable rows in the report.
	for (const failure of loader.loadFailures()) {
		rows.push({
			capability: failure.key,
			provider: failure.provider,
			status: "fail",
			message: failure.error.message,
		});
	}

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

	const log = getLogger();
	// Render rows
	for (const row of rows) {
		log[row.status === "fail" ? "warn" : "info"](
			{ capability: row.capability, provider: row.provider, status: row.status, detail: row.message },
			`doctor: ${row.capability}`
		);
		print(statusRow(row.status, [`${pad(row.capability, 14)} via ${pad(row.provider, 14)}`, row.message]));
	}

	const summary = rows.reduce(
		(acc, r) => {
			acc[r.status] += 1;
			return acc;
		},
		{ ok: 0, fail: 0, skip: 0 }
	);

	const summaryLine = `${summary.ok} ok, ${summary.fail} fail, ${summary.skip} skipped`;
	print("");
	print(style.header(summaryLine));

	return { rows, summary };
}

// ── smoke checks ────────────────────────────────────────────────────

/** A stalled provider request must not hang the whole report forever. */
const SMOKE_CHECK_TIMEOUT_MS = 10_000;

/** Rejects after `ms` if `promise` hasn't settled yet — races, never cancels the original call. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(err: unknown) => {
				clearTimeout(timer);
				reject(err);
			}
		);
	});
}

async function smokeCheck(key: string, provider: string, impl: unknown): Promise<DoctorRow> {
	try {
		return await withTimeout(runSmokeCheck(key, provider, impl), SMOKE_CHECK_TIMEOUT_MS);
	} catch (err) {
		return mk(key, provider, "fail", errorMessage(err));
	}
}

async function runSmokeCheck(key: string, provider: string, impl: unknown): Promise<DoctorRow> {
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
		case "deployment": {
			const projects = await (impl as Deployment).listProjects();
			return mk(key, provider, "ok", `${projects.length} project(s) visible`);
		}
		case "environments": {
			const envs = await (impl as Environments).listEnvironments();
			return mk(key, provider, "ok", `${envs.length} environment(s) configured`);
		}
		case "dns": {
			const dns = impl as Dns;
			if (dns.whoami) {
				const who = await dns.whoami();
				return mk(key, provider, who.ok ? "ok" : "fail", `${who.zones} zone(s) visible`);
			}
			return mk(key, provider, "skip", "loaded (no smoke check defined for this capability)");
		}
		case "workers": {
			const workers = impl as Workers;
			if (workers.whoami) {
				const who = await workers.whoami();
				return mk(key, provider, who.ok ? "ok" : "fail", `${who.scripts} script(s) visible`);
			}
			return mk(key, provider, "skip", "loaded (no smoke check defined for this capability)");
		}
		case "auth": {
			// `whoami` is required on every Auth provider (unlike the optional
			// whoami? on dns/workers/monitoring/errors) — it's always safe to
			// call directly rather than falling back to describe()'s mere
			// env-key listing.
			const who = await (impl as Auth).whoami();
			const details = who.details
				? ` (${Object.entries(who.details)
						.map(([k, v]) => `${k}=${v}`)
						.join(", ")})`
				: "";
			return mk(key, provider, "ok", `whoami: ${who.provider}${details}`);
		}
		case "errors": {
			const errors = impl as Errors;
			// `null` means whoami genuinely can't run on an otherwise-valid
			// config (e.g. Sentry's optional `org` unset) — fall back to
			// describe() same as a provider with no whoami at all, rather
			// than treating it as a failure.
			const who = errors.whoami ? await errors.whoami() : null;
			if (who) return mk(key, provider, "ok", `org: ${who.org}`);
			const desc = await errors.describe();
			return mk(key, provider, "ok", `provider: ${desc.provider}; env keys: ${desc.envKeys.join(", ")}`);
		}
		case "logs": {
			const logs = impl as Logs;
			const desc = await logs.describe();
			if (logs.whoami) {
				const who = await logs.whoami();
				return mk(key, provider, who.ok ? "ok" : "fail", `dataset: ${who.dataset}`);
			}
			return mk(key, provider, "ok", `provider: ${desc.provider}; env keys: ${desc.envKeys.join(", ")}`);
		}
		case "monitoring": {
			const monitoring = impl as Monitoring;
			if (monitoring.whoami) {
				const who = await monitoring.whoami();
				return mk(key, provider, who.ok ? "ok" : "fail", who.ok ? "token verified" : "token check failed");
			}
			return mk(key, provider, "skip", "loaded (no smoke check defined for this capability)");
		}
		default:
			return mk(key, provider, "skip", "loaded (no smoke check defined for this capability)");
	}
}

function countResolvedLifecycle(report: Awaited<ReturnType<Issues["doctor"]>>): string {
	const resolved = report.lifecycle.filter((l) => l.resolved).length;
	return `${resolved}/${report.lifecycle.length} lifecycle slots ready`;
}

function mk(capability: string, provider: string, status: DoctorStatus, message: string): DoctorRow {
	return { capability, provider, status, message };
}
