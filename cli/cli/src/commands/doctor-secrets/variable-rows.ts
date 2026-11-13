/**
 * The Actions-variable side of `holocron doctor secrets`: do the variables `repo.variables` declares exist, with those
 * values?
 *
 * Read-only. One row for the repository's variables and one for the organization's, each only when the config
 * declares that scope, and one per `repo.variables.sync` entry that checks its names exist (the values are in the
 * vault, so none is compared or shown). A variable that exists but is not declared is a problem only with `repo.variables.prune`,
 * since without it `setup` leaves it alone. A scope that cannot be read because there is no provider, the
 * provider cannot list variables, or the token is missing is a skip with the reason, not a failure.
 */

import { type CheckRow, declaredVsActual } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import type { ResolvedHolocronConfig } from "../../config/index.js";
import type { PluginLoader, Source } from "../../plugin/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import { whyMissing } from "../notifications-channel-add/index.js";
import type {
	VariableObservation,
	VariableRowsResult,
	VariableScopeCheck,
	VariableScopeResult,
} from "./doctor-secrets.type.js";
import { syncVariableChecks } from "./sync-variable-checks.js";

const REPO_TITLE = "repository variables match";
const ORG_TITLE = "organization variables match";

type Visibility = "all" | "private" | "selected";
type OrgVariable = { value: string; visibility: Visibility };

type Result = VariableScopeResult;
type ScopeCheck = VariableScopeCheck;

/**
 * Runs the variable checks and returns their rows, and what each scope held (names only) so the matrix can show it.
 *
 * @param loader - The loaded plugins.
 * @param config - The resolved config.
 * @param org - The organization the organization variables live in, when it is known.
 * @returns Whether the config declares any variable, the rows, and one observation per scope read.
 */
export async function variableRows(
	loader: PluginLoader,
	config: ResolvedHolocronConfig,
	org: string | undefined
): Promise<VariableRowsResult> {
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
			scope: "repo",
			async run(source) {
				if (!source.listVariables) return { skip: "provider does not implement listVariables" };
				const declared = variables!.repo!;
				const have = await source.listVariables();
				const problems = compareRepo(declared, have, prune);
				return { problems, checked: Object.keys(declared).length, have: Object.keys(have) };
			},
		});
	}
	if (declares(variables?.org)) {
		checks.push({
			id: "org-variables",
			title: ORG_TITLE,
			scope: "org",
			async run(source) {
				if (!source.listOrgVariables) return { skip: "provider does not implement listOrgVariables" };
				if (!org) {
					return {
						problems: ["no organization: set `org` in the config or run inside a repository"],
						checked: 0,
					};
				}
				const declared = variables!.org!;
				const have = await source.listOrgVariables(org);
				const problems = compareOrg(declared, have, prune);
				return { problems, checked: Object.keys(declared).length, have: Object.keys(have) };
			},
		});
	}

	// What `repo.variables.sync` fills from a vault: names only, since the values are in the vault.
	checks.push(...syncVariableChecks(variables?.sync));

	const rows: CheckRow[] = [];
	const observations: VariableObservation[] = [];
	if (checks.length === 0) return { declared: false, rows, observations };
	if (!loader.has("source")) {
		const why = whyMissing(loader, "source", "no `source` provider to read them with");
		for (const check of checks) {
			rows.push(row(check, { skip: why }));
			observations.push({ scope: check.scope, unread: why });
		}
	} else {
		const source = loader.get("source") as Source;
		for (const check of checks) {
			try {
				const result = await check.run(source);
				rows.push(row(check, result));
				observations.push(
					"skip" in result
						? { scope: check.scope, unread: result.skip }
						: { scope: check.scope, ...(result.have ? { have: result.have } : {}) }
				);
			} catch (err) {
				const noToken = missingTokenReason(err);
				if (noToken !== undefined) {
					rows.push(row(check, { skip: noToken }));
					observations.push({ scope: check.scope, unread: noToken });
				} else {
					rows.push({
						id: check.id,
						title: check.title,
						status: "fail",
						detail: errorMessage(err),
						problems: [],
					});
					observations.push({ scope: check.scope, unread: errorMessage(err) });
				}
			}
		}
	}
	return { declared: true, rows, observations };
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
	// A bare string is visible to every repository, as `setup` writes it.
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
