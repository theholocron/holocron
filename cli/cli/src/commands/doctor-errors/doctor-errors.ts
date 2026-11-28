/**
 * `holocron doctor errors` — does the error tracker the config declares have the organization, projects, keys and
 * alert rules it relies on?
 *
 * Read-only: it never creates a project or a rule, and prints names and counts only, never a DSN, a key or a token.
 * The rows (`errorsRows()`): the organization; for each project a notifications layout's `relay.errors.projects`
 * declares, that it exists, has a client key and is watched by an enabled alert rule. The Comlink relay's own
 * integration and rule are `doctor notifications`' rows and are not repeated. A project the provider says is missing
 * fails; anything that cannot be read (no token, no `org`, a token without the alert scope) is a skip with the reason.
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
import { missingTokenReason } from "../missing-token/index.js";
import { declaredProjects } from "./declared-projects.js";
import type { DoctorErrorsReport, RunDoctorErrorsInput } from "./doctor-errors.type.js";
import { errorsRows } from "./errors-rows.js";

const skip = (detail: string): CheckRow => ({ id: "errors", title: "errors", status: "skip", detail, problems: [] });

export async function runDoctorErrors(input: RunDoctorErrorsInput): Promise<DoctorErrorsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor errors");

	let rows: CheckRow[];
	if (!loader.has("errors")) {
		const failure = loader.loadFailures().find((f) => f.key === "errors");
		rows = [
			skip(
				failure
					? `\`${failure.provider}\` failed to load: ${describeError(failure.error)}`
					: "no `errors` provider is configured in holocron.config.ts"
			),
		];
	} else {
		const errors = loader.get("errors");
		if (!errors.inspect) {
			rows = [skip(`${errors.providerName} cannot read its organization`)];
		} else {
			const layouts = (loader.has("notifications") ? loader.get("notifications") : []).flatMap((p) =>
				p.layout ? [p.layout] : []
			);
			try {
				const found = await errors.inspect({ projects: declaredProjects(layouts) });
				rows = errorsRows(found, errors.providerName);
			} catch (err) {
				rows = [
					skip(missingTokenReason(err) ?? `could not read ${errors.providerName}: ${describeError(err)}`),
				];
			}
		}
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor errors");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: rows.map((r) => r.detail).join("; ") } : {}),
	};
}
