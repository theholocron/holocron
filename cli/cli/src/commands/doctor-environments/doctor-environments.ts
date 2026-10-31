/**
 * `holocron doctor environments` — do the deployment environments the config relies on exist?
 *
 * Read-only. The environments that must exist are the ones `repo setup` creates (when an `environments`
 * provider is configured) and every environment `repo.secrets.environments` names, since a secret can only be
 * set on one that exists. An environment that exists but is not expected is never a problem. With no provider and
 * nothing named, nothing is declared; with no provider but some named, the row is a skip with the reason.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, type Environments, MissingTokenError, PluginLoader } from "../../plugin/index.js";
import {
	type CheckRow,
	declaredVsActual,
	printCheckRows,
	printCheckSummary,
	summariseChecks,
} from "../doctor-checks/index.js";
import { whyMissing } from "../notifications-channel-add/index.js";
import { SETUP_ENVIRONMENTS } from "../setup/setup-environments.js";
import type { DoctorEnvironmentsReport, RunDoctorEnvironmentsInput } from "./doctor-environments.type.js";

const ID = "environments";
const TITLE = "environments exist";

export async function runDoctorEnvironments(input: RunDoctorEnvironmentsInput): Promise<DoctorEnvironmentsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor environments");

	const named = Object.keys(input.loaded.resolved.repo?.secrets?.environments ?? {});
	const row = await checkEnvironments(loader, named);

	printCheckRows([row], print);
	const summary = summariseChecks([row]);
	printCheckSummary(summary, print);

	logger.info({ ...summary, status: row.status }, "doctor environments");
	return {
		status: row.status,
		rows: [row],
		summary,
		...(row.status === "skip" ? { reason: row.detail } : {}),
	};
}

// ── helpers ──────────────────────────────────────────────────────────

async function checkEnvironments(loader: PluginLoader, named: string[]): Promise<CheckRow> {
	const make = (status: CheckRow["status"], detail: string, problems: string[] = []): CheckRow => ({
		id: ID,
		title: TITLE,
		status,
		detail,
		problems,
	});
	if (!loader.has("environments")) {
		return named.length === 0
			? make("ok", "none declared")
			: make("skip", whyMissing(loader, "environments", "no `environments` provider to check them with"));
	}
	// The provider creates these on `repo setup`, so they must be there, along with any a secret is set on.
	const names = [...new Set([...SETUP_ENVIRONMENTS, ...named].map((n) => n.toLowerCase()))];
	try {
		const have = await (loader.get("environments") as Environments).listEnvironments();
		const problems = declaredVsActual(
			new Map(names.map((name) => [name, true])),
			new Map(have.map((env) => [env.name.toLowerCase(), true])),
			{ noun: "environment", flagExtra: false }
		);
		return problems.length > 0
			? make("fail", `${problems.length} problem(s)`, problems)
			: make("ok", `${names.length} of ${names.length} exist`);
	} catch (err) {
		return err instanceof MissingTokenError ? make("skip", err.message) : make("fail", errorMessage(err));
	}
}
