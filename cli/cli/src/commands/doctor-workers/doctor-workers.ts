/**
 * `holocron doctor workers` — do the Workers and deployment projects the config declares exist, route and deploy?
 *
 * Read-only: it never deploys, routes or binds anything, and prints names, hostnames and times only, never a secret
 * value or a token. For each declared Worker (the relay Worker of a notifications layout, a wiki's reverse proxy):
 * the script is deployed with its route, has the bindings it needs (by name), and its newest deployment serves all
 * traffic. For each deployment project `setup` makes (the preview project, or one named like the repo): it exists, its
 * custom domain is attached, and the newest production deployment is ready. Only what the provider proves wrong
 * fails; a missing token, a 401 or 403, or a provider that cannot read it is a skip with the reason.
 */

import {
	type CheckRow,
	describeError,
	printCheckRows,
	printCheckSummary,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader } from "../../plugin/index.js";
import { checkProject } from "./check-project.js";
import { checkWorker } from "./check-worker.js";
import { declaredProjects } from "./declared-projects.js";
import { declaredWorkers } from "./declared-workers.js";
import type { DoctorWorkersReport, RunDoctorWorkersInput } from "./doctor-workers.type.js";

const row = (id: string, title: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title,
	status,
	detail,
	problems: [],
});

/** Why a capability is not there: the plugin failed to load, or none is configured. */
function whyNone(
	loader: PluginLoader,
	key: "workers" | "deployment" | "wiki" | "errors" | "notifications",
	fallback: string
): string {
	const failure = loader.loadFailures().find((f) => f.key === key);
	return failure ? `\`${failure.provider}\` failed to load: ${describeError(failure.error)}` : fallback;
}

export async function runDoctorWorkers(input: RunDoctorWorkersInput): Promise<DoctorWorkersReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor workers");

	const rows: CheckRow[] = [];

	// Workers
	const workers = loader.has("workers") ? loader.get("workers") : undefined;
	const declared = declaredWorkers({
		layouts: (loader.has("notifications") ? loader.get("notifications") : []).flatMap((p) =>
			p.layout ? [p.layout] : []
		),
		...(loader.has("errors") ? { errors: loader.get("errors") } : {}),
		...(loader.has("wiki") ? { wiki: loader.get("wiki") } : {}),
		...(workers ? { workers } : {}),
	});
	if (declared.length === 0) {
		rows.push(row("workers", "declared Workers", "ok", "none declared"));
	} else if (!workers) {
		const why = whyNone(loader, "workers", "no `workers` provider is configured in holocron.config.ts");
		for (const worker of declared) rows.push(row(`workers:${worker.label}`, `${worker.label} Worker`, "skip", why));
	} else {
		for (const worker of declared) rows.push(...(await checkWorker(workers, worker)));
	}

	// Deployment projects
	if (!loader.has("deployment")) {
		rows.push(
			row(
				"deployment",
				"deployment project",
				"skip",
				whyNone(loader, "deployment", "no `deployment` provider is configured in holocron.config.ts")
			)
		);
	} else {
		const deploy = loader.get("deployment");
		for (const project of declaredProjects(input.loaded.resolved, deploy)) {
			rows.push(...(await checkProject(deploy, project)));
		}
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor workers");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: [...new Set(rows.map((r) => r.detail))].join("; ") } : {}),
	};
}
