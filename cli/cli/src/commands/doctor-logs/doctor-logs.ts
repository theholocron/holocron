/**
 * `holocron doctor logs` — does each Axiom dataset the setup ships logs to exist, and does the token reach them?
 *
 * Read-only: it never creates a dataset, and prints names and numbers only, never a token or a secret value. One row for
 * the token (accepted by the provider), one per dataset (the CLI's, Sentinel's and any other `dev.serve.logging` names),
 * one for the organization, and an `info` row per existing dataset with its retention (ADR-0019: one setting for the whole
 * dataset, shared by every environment in it). Only a dataset the provider says is missing, or a token it refuses, fails;
 * a name, a token or a response that cannot be read is a skip with the reason.
 */

import { PREFIX } from "@theholocron/env-utils/lookup";
import {
	type CheckRow,
	describeError,
	printCheckRows,
	printCheckSummary,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { resolveValue } from "../../auth.js";
import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, type Logs, PluginLoader } from "../../plugin/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import { datasetTargets } from "./dataset-targets.js";
import type { DoctorLogsReport, LogsDatasetTarget, RunDoctorLogsInput } from "./doctor-logs.type.js";

const row = (
	id: string,
	title: string,
	status: CheckRow["status"],
	detail: string,
	problems: string[] = []
): CheckRow => ({ id, title, status, detail, problems });

export async function runDoctorLogs(input: RunDoctorLogsInput): Promise<DoctorLogsReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor logs");

	const rows: CheckRow[] = [];
	if (!loader.has("logs")) {
		const failure = loader.loadFailures().find((f) => f.key === "logs");
		const why = failure
			? `\`${failure.provider}\` failed to load: ${describeError(failure.error)}`
			: "no `logs` provider is configured in holocron.config.ts";
		rows.push(row("logs", "logs", "skip", why));
	} else {
		rows.push(...(await checkLogs(loader.get("logs") as Logs, datasetTargets(input.loaded.resolved))));
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor logs");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: rows.map((r) => r.detail).join("; ") } : {}),
	};
}

async function checkLogs(logs: Logs, targets: LogsDatasetTarget[]): Promise<CheckRow[]> {
	const rows: CheckRow[] = [];
	const token = await checkToken(logs);
	rows.push(token.row);

	for (const target of targets) {
		const id = `logs:dataset:${target.id}`;
		const title = `dataset for ${target.label}`;
		if (!target.name) {
			rows.push(row(id, title, "skip", `${target.variable} is not set here, so there is no name to look for`));
		} else if (!token.usable) {
			rows.push(row(id, title, "skip", `${target.name}: not checked, the token is not usable`));
		} else if (!logs.readDataset) {
			rows.push(row(id, title, "skip", `${logs.providerName} cannot read a dataset`));
		} else {
			rows.push(...(await checkDataset(logs, target, target.name, id, title)));
		}
	}

	// Sentinel's check-run links and the dispatched check need the org; an unset one here may only mean this machine
	// does not hold it (it is an org variable), so it is a skip, never a failure.
	const org = resolveValue(["AXIOM_ORG"], undefined, { prefix: PREFIX });
	rows.push(
		org
			? row("logs:org", "organization", "ok", `${PREFIX}_AXIOM_ORG (or AXIOM_ORG) is set`)
			: row(
					"logs:org",
					"organization",
					"skip",
					`${PREFIX}_AXIOM_ORG (or AXIOM_ORG) is not set here; Sentinel's log links and check-dispatched need it`
				)
	);
	return rows;
}

/** Whether the provider accepts the token. `usable` is false when it was refused or could not be tried. */
async function checkToken(logs: Logs): Promise<{ row: CheckRow; usable: boolean }> {
	const title = "token is accepted";
	if (!logs.checkToken) {
		return { row: row("logs:token", title, "skip", `${logs.providerName} cannot check a token`), usable: true };
	}
	try {
		const result = await logs.checkToken();
		if (result.ok)
			return { row: row("logs:token", title, "ok", `${logs.providerName} accepts the token`), usable: true };
		const reason = result.reason ?? `${logs.providerName} refused the token`;
		return { row: row("logs:token", title, "fail", reason, [reason]), usable: false };
	} catch (err) {
		const noToken = missingTokenReason(err);
		const detail = noToken ?? `could not check the token: ${describeError(err)}`;
		// A token that cannot be tried says nothing about the datasets, but one that is missing cannot read any.
		return { row: row("logs:token", title, "skip", detail), usable: noToken === undefined };
	}
}

async function checkDataset(
	logs: Logs,
	target: LogsDatasetTarget,
	name: string,
	id: string,
	title: string
): Promise<CheckRow[]> {
	try {
		const found = await logs.readDataset!(name);
		if (!found.exists) {
			const problem = `dataset ${name} does not exist (${target.variable}); ${target.fix}`;
			return [row(id, title, "fail", `${name} does not exist`, [problem])];
		}
		const retention =
			found.retentionDays === undefined
				? `retention: ${logs.providerName} did not report one for ${name}`
				: `retention: ${found.retentionDays} days for ${name}`;
		return [
			row(id, title, "ok", `${name} exists`),
			// Information only: it counts as skipped and never fails the run.
			row(
				`logs:retention:${target.id}`,
				`retention of ${name}`,
				"skip",
				`info: ${retention}; one setting shared by every environment in the dataset (ADR-0019)`
			),
		];
	} catch (err) {
		const detail = missingTokenReason(err) ?? `could not read ${name}: ${describeError(err)}`;
		return [row(id, title, "skip", detail)];
	}
}
