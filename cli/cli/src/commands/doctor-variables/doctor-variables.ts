/**
 * `holocron doctor variables` — do the Actions variables `repo.variables` declares exist, with those values?
 *
 * Read-only. One row for the repository's variables and one for the organization's, each only when the config
 * declares that scope. A variable that exists but is not declared is a problem only with `repo.variables.prune`,
 * since without it `repo setup` leaves it alone. A scope that cannot be read because there is no provider, the
 * provider cannot list variables, or the token is missing is a skip with the reason, not a failure.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type Source } from "../../plugin/index.js";
import {
	type CheckRow,
	declaredVsActual,
	printCheckRows,
	printCheckSummary,
	summariseChecks,
} from "../doctor-checks/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import { whyMissing } from "../notifications-channel-add/index.js";
import type { DoctorVariablesReport, RunDoctorVariablesInput } from "./doctor-variables.type.js";

const REPO_TITLE = "repository variables match";
const ORG_TITLE = "organization variables match";

type Visibility = "all" | "private" | "selected";
type OrgVariable = { value: string; visibility: Visibility };

/** Either why the scope could not be read, or the problems found (none when it matches). */
type Result = { skip: string } | { problems: string[]; checked: number };

interface ScopeCheck {
	id: string;
	title: string;
	run(source: Source): Promise<Result>;
}

export async function runDoctorVariables(input: RunDoctorVariablesInput): Promise<DoctorVariablesReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor variables");

	const config = input.loaded.resolved;
	const variables = config.repo?.variables;
	const prune = variables?.prune === true;
	// A scope declared empty still matters with `prune`: anything in it is then unexpected.
	const declares = (scope: object | undefined): boolean =>
		scope !== undefined && (Object.keys(scope).length > 0 || prune);

	const checks: ScopeCheck[] = [];
	if (declares(variables?.repo)) {
		checks.push({
			id: "repo-variables",
			title: REPO_TITLE,
			async run(source) {
				if (!source.listVariables) return { skip: "provider does not implement listVariables" };
				const declared = variables!.repo!;
				const problems = compareRepo(declared, await source.listVariables(), prune);
				return { problems, checked: Object.keys(declared).length };
			},
		});
	}
	if (declares(variables?.org)) {
		checks.push({
			id: "org-variables",
			title: ORG_TITLE,
			async run(source) {
				if (!source.listOrgVariables) return { skip: "provider does not implement listOrgVariables" };
				const org = input.context.org ?? (input.context.repo ?? config.repo?.name ?? "").split("/")[0];
				if (!org) {
					return {
						problems: ["no organization: set `org` in the config or run inside a repository"],
						checked: 0,
					};
				}
				const declared = variables!.org!;
				const problems = compareOrg(declared, await source.listOrgVariables(org), prune);
				return { problems, checked: Object.keys(declared).length };
			},
		});
	}

	const rows: CheckRow[] = [];
	if (checks.length === 0) {
		rows.push({ id: "variables", title: "variables", status: "ok", detail: "none declared", problems: [] });
	} else if (!loader.has("source")) {
		const why = whyMissing(loader, "source", "no `source` provider to read them with");
		for (const check of checks) rows.push(row(check, { skip: why }));
	} else {
		const source = loader.get("source") as Source;
		for (const check of checks) {
			try {
				rows.push(row(check, await check.run(source)));
			} catch (err) {
				const noToken = missingTokenReason(err);
				if (noToken !== undefined) rows.push(row(check, { skip: noToken }));
				else
					rows.push({
						id: check.id,
						title: check.title,
						status: "fail",
						detail: errorMessage(err),
						problems: [],
					});
			}
		}
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor variables");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: rows.map((r) => r.detail).join("; ") } : {}),
	};
}

// ── helpers ──────────────────────────────────────────────────────────

function row(check: ScopeCheck, result: Result): CheckRow {
	const { id, title } = check;
	if ("skip" in result) return { id, title, status: "skip", detail: result.skip, problems: [] };
	if (result.problems.length > 0) {
		return { id, title, status: "fail", detail: `${result.problems.length} problem(s)`, problems: result.problems };
	}
	return { id, title, status: "ok", detail: `${result.checked} of ${result.checked} match`, problems: [] };
}

/** Re-keys what GitHub holds by the spelling the config declares, since GitHub treats names as case-insensitive. */
function bySpelling<T>(declared: string[], have: Record<string, T>): Map<string, T> {
	const spelled = new Map(declared.map((name) => [name.toUpperCase(), name]));
	return new Map(Object.entries(have).map(([name, value]) => [spelled.get(name.toUpperCase()) ?? name, value]));
}

function compareRepo(declared: Record<string, string>, have: Record<string, string>, prune: boolean): string[] {
	return declaredVsActual(new Map(Object.entries(declared)), bySpelling(Object.keys(declared), have), {
		noun: "variable",
		flagExtra: prune,
		show: (value) => JSON.stringify(value),
	});
}

function compareOrg(
	declared: Record<string, string | { value: string; visibility?: "all" | "private" }>,
	have: Record<string, OrgVariable>,
	prune: boolean
): string[] {
	// A bare string is visible to every repository, as `repo setup` writes it.
	const wanted = new Map<string, OrgVariable>(
		Object.entries(declared).map(([name, v]) => [
			name,
			typeof v === "string"
				? { value: v, visibility: "all" }
				: { value: v.value, visibility: v.visibility ?? "all" },
		])
	);
	const found = bySpelling(Object.keys(declared), have);
	// A variable limited to selected repositories is not managed, so one that is not declared is never reported.
	for (const [name, v] of found) if (!wanted.has(name) && v.visibility === "selected") found.delete(name);
	return declaredVsActual(wanted, found, {
		noun: "organization variable",
		flagExtra: prune,
		equal: (a, b) => a.value === b.value && a.visibility === b.visibility,
		show: (v) => `${JSON.stringify(v.value)} (${v.visibility})`,
	});
}
