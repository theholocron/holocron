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
 *   wiki     → `whoami()` (token presence only — not a live check, see holocron#1079)
 *   notifications → `whoami()` when the provider provisions (bot token + server access); otherwise just "loaded"
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
	type Notifications,
	PluginLoader,
	type Secrets,
	type Source,
	type Vault,
	type Wiki,
	type Workers,
} from "../../plugin/index.js";
import { pad, statusRow, style, withProgress, withSpinner } from "../../ui/index.js";
import { describeProviderError, sanitizeDetail } from "../../ui/provider-error/index.js";
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
			// Each provider is checked on its own; a capability with no smoke check
			// for a provider still reports "loaded" (see runSmokeCheck's default).
			// Label each row by the implementation's own name: a provider that failed
			// to load is missing from `impls` but still in the configured list, so
			// indexing the list would put a later provider's result under the wrong name.
			for (const [idx, impl] of impls.entries()) {
				const name = (impl as { providerName?: string }).providerName ?? providers[idx]!;
				rows.push(await withProgress(`Checking ${key} (${name})…`, () => smokeCheck(key, name, impl)));
			}
		} else {
			const impl = loader.get(key) as unknown;
			const row = await withProgress(`Checking ${key} (${providers[0] ?? "?"})…`, () =>
				smokeCheck(key, providers[0] ?? "?", impl)
			);
			rows.push(row);
		}
	}

	const log = getLogger();
	// Render rows
	for (const row of rows) {
		log[row.status === "fail" ? "warn" : "info"](
			{
				capability: row.capability,
				provider: row.provider,
				status: row.status,
				detail: row.logMessage ?? row.message,
			},
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
		// `message` (terminal display) gets the enriched, sanitized/capped
		// detail; `logMessage` (telemetry) stays the plain vendor-body-free
		// summary — a provider's raw response text has no business leaving
		// this machine via the structured logger.
		return mk(key, provider, "fail", describeProviderError(err), errorMessage(err));
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
			return mk(key, provider, "ok", describeLifecycle(report));
		}
		case "secrets": {
			const names = await (impl as Secrets).listSecrets({ kind: "repo" });
			return mk(key, provider, "ok", `secrets: ${names.length} configured`);
		}
		case "ci": {
			const runs = await (impl as Ci).listRuns({ limit: 1 });
			return mk(
				key,
				provider,
				"ok",
				runs.length === 0 ? "runs: none recent" : `most recent: ${runs[0]!.workflowName} (${runs[0]!.status})`
			);
		}
		case "vault": {
			const keys = await (impl as Vault).list();
			return mk(key, provider, "ok", `keys: ${keys.length} visible`);
		}
		case "deployment": {
			const projects = await (impl as Deployment).listProjects();
			return mk(key, provider, "ok", `projects: ${projects.length} visible`);
		}
		case "environments": {
			const envs = await (impl as Environments).listEnvironments();
			return mk(key, provider, "ok", `environments: ${envs.length} configured`);
		}
		case "dns": {
			const dns = impl as Dns;
			if (dns.whoami) {
				const who = await dns.whoami();
				return mk(key, provider, who.ok ? "ok" : "fail", `zones: ${who.zones} visible`);
			}
			return mk(key, provider, "skip", "loaded (no smoke check defined for this capability)");
		}
		case "workers": {
			const workers = impl as Workers;
			if (workers.whoami) {
				const who = await workers.whoami();
				return mk(key, provider, who.ok ? "ok" : "fail", `scripts: ${who.scripts} visible`);
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
				return mk(key, provider, who.ok ? "ok" : "fail", who.ok ? "token: verified" : "token: check failed");
			}
			return mk(key, provider, "skip", "loaded (no smoke check defined for this capability)");
		}
		case "notifications": {
			const notifications = impl as Notifications;
			const who = notifications.whoami ? await notifications.whoami() : null;
			// The target is a name someone else chose (a server name); keep it off the terminal raw.
			if (who) return mk(key, provider, "ok", `server: ${sanitizeDetail(who.target)}`);
			return mk(key, provider, "skip", "loaded (no smoke check defined for this capability)");
		}
		case "wiki": {
			const wiki = impl as Wiki;
			if (wiki.whoami) {
				const who = await wiki.whoami();
				// Not a live reachability check — see holocron#1079. "ok" means
				// only that a token was found, not that it works.
				return mk(
					key,
					provider,
					who.ok ? "ok" : "fail",
					who.ok ? "token: configured" : "token: not configured"
				);
			}
			return mk(key, provider, "skip", "loaded (no smoke check defined for this capability)");
		}
		default:
			return mk(key, provider, "skip", "loaded (no smoke check defined for this capability)");
	}
}

/**
 * What the issues row says: how many lifecycle slots (inProgress, inReview, done)
 * map to something the tracker recognises, and which do not. The token's user and
 * the repo are not repeated -- `source` already names the account, and a slot
 * that is not configured is the part someone has to act on.
 */
function describeLifecycle(report: Awaited<ReturnType<Issues["doctor"]>>): string {
	const unresolved = report.lifecycle.filter((l) => !l.resolved).map((l) => l.slot);
	const ready = report.lifecycle.length - unresolved.length;
	const base = `lifecycle: ${ready}/${report.lifecycle.length} slots ready`;
	return unresolved.length > 0 ? `${base} (unresolved: ${unresolved.join(", ")})` : base;
}

function mk(
	capability: string,
	provider: string,
	status: DoctorStatus,
	message: string,
	logMessage?: string
): DoctorRow {
	return { capability, provider, status, message, ...(logMessage !== undefined ? { logMessage } : {}) };
}
