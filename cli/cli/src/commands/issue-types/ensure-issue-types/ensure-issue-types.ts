/**
 * Makes the organization's issue Types match the org area's `issueTypes` (spec `tech-org-issue-types`, #2512).
 *
 * One function for both callers, `holocron apply issue-types` and the `setup` step (`caller`). It reads the list
 * (`Issues.listTypes`), plans (`planIssueTypes()`: a missing name is made, and with `update` an existing Type's
 * description or colour is brought in line), checks the limit, asks once, then writes in declaration order through
 * `createType` / `updateType`. It never deletes, renames or changes `enabled`. It prints nothing and returns the rows;
 * the caller shows them with `printCheckRows`.
 */

import { confirm } from "@inquirer/prompts";
import { type CheckRow, describeError, NonInteractiveError } from "@theholocron/kyber/ui";

import type { Issues, IssueTypeDeclaration, IssueTypeInfo } from "../../../plugin/index.js";
import { classifyTypeError } from "../classify-type-error/index.js";
import { planIssueTypes, type TypeAction } from "../plan-issue-types/index.js";
import type { EnsureIssueTypesInput, EnsureIssueTypesReport } from "./ensure-issue-types.type.js";

/** The most Types GitHub documents for an organization, the three defaults included (Decision 12; not verified). */
export const MAX_ISSUE_TYPES = 25;

const WRITE_PERMISSION =
	"creating or changing issue Types needs an organization admin and the organization permission Issue types: write (HOLOCRON_ORG_TOKEN)";
const READ_PERMISSION =
	"reading the organization's issue Types needs the organization permission Issue types: read (HOLOCRON_ORG_TOKEN)";

const row = (
	id: string,
	title: string,
	status: CheckRow["status"],
	detail: string,
	problems: string[] = []
): CheckRow => ({
	id: `issue-types:${id}`,
	title,
	status,
	detail,
	problems,
});

const toDeclaration = (t: IssueTypeDeclaration): IssueTypeDeclaration => ({
	name: t.name,
	...(t.description !== undefined ? { description: t.description } : {}),
	...(t.color !== undefined ? { color: t.color } : {}),
	...(t.enabled !== undefined ? { enabled: t.enabled } : {}),
});

/** Reads the declared Types against the organization and, unless `dryRun`, writes the difference. See the file comment. */
export async function ensureIssueTypes(input: EnsureIssueTypesInput): Promise<EnsureIssueTypesReport> {
	const created: string[] = [];
	const updated: string[] = [];
	// What a person who asked for it sees as a failure is, in `setup`, only a skip.
	const refused: "skip" | "fail" = input.caller === "setup" ? "skip" : "fail";
	const stop = (status: "skip" | "fail", detail: string, problems: string[] = []): EnsureIssueTypesReport => ({
		status,
		rows: [row("types", "issue types", status, detail, problems)],
		created,
		updated,
	});

	const declared = input.declared ?? [];
	if (declared.length === 0) return stop("skip", "no issueTypes declared in the org area");
	const issues: Issues | undefined = input.issues;
	if (!issues) return stop(refused, input.missingReason ?? "no `issues` provider to read the Types with");
	if (!issues.listTypes || !issues.createType) {
		return stop("skip", `the \`${issues.providerName}\` provider has no issue Types`);
	}

	let existing: IssueTypeInfo[] | undefined;
	try {
		existing = await issues.listTypes();
	} catch (err) {
		return stop(refused, classifyTypeError(err) === "refused" ? READ_PERMISSION : describeError(err));
	}
	if (existing === undefined) return stop(refused, `cannot read the organization's issue Types: ${READ_PERMISSION}`);

	const plan = planIssueTypes(declared, existing, input.update);
	const creates = plan.actions.filter((a) => a.kind === "create");
	if (creates.length > 0 && plan.total > MAX_ISSUE_TYPES) {
		return stop(
			refused,
			`${existing.length} Types exist and ${creates.length} more would be made: ${plan.total} is over the limit of ${MAX_ISSUE_TYPES}; nothing was written`
		);
	}
	const todo = plan.actions.filter((a) => a.kind !== "exists");

	if (input.dryRun || todo.length === 0) {
		const rows = plan.actions.map((a) => describeAction(a));
		const names = (kind: TypeAction["kind"]) =>
			plan.actions.filter((a) => a.kind === kind).map((a) => a.declared.name);
		return {
			status: "ok",
			rows,
			created: input.dryRun ? names("create") : [],
			updated: input.dryRun ? names("update") : [],
		};
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			if (input.caller === "apply") {
				throw new NonInteractiveError(
					"`apply issue-types` changes the organization's issue Types; pass --yes to run it without asking"
				);
			}
			return stop("skip", "changing the organization's issue Types needs an answer: pass --yes");
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Change the organization's issue Types?\n${todo.map((a) => `  ${describeAction(a).detail} ${a.declared.name}`).join("\n")}`
		);
		if (!proceed) {
			return {
				status: "cancelled",
				rows: [row("types", "issue types", "skip", "cancelled; nothing was changed")],
				created,
				updated,
			};
		}
	}

	const rows: CheckRow[] = [];
	let limited = false;
	let refusedOnce = false;
	for (const action of plan.actions) {
		const name = action.declared.name;
		if (action.kind === "exists") {
			rows.push(describeAction(action));
			continue;
		}
		if (limited) {
			rows.push(row(name, name, "skip", "left: stopped at a rate limit"));
			continue;
		}
		if (refusedOnce) {
			rows.push(row(name, name, refused, "not written: the token was refused"));
			continue;
		}
		try {
			if (action.kind === "create") {
				await issues.createType(toDeclaration(action.declared));
				created.push(name);
				rows.push(row(name, name, "ok", "created"));
			} else {
				const patch = Object.fromEntries(action.changes.map((c) => [c.field, c.to]));
				await issues.updateType?.(action.existing.id, patch);
				updated.push(name);
				rows.push(row(name, name, "ok", `updated ${action.changes.map((c) => c.field).join(", ")}`));
			}
		} catch (err) {
			const kind = classifyTypeError(err);
			if (kind === "rate-limit") {
				limited = true;
				rows.push(row(name, name, "fail", "rate limited: stopped; run it again to finish"));
			} else if (kind === "refused") {
				refusedOnce = true;
				rows.push(row(name, name, refused, WRITE_PERMISSION));
			} else if (kind === "conflict" && action.kind === "create" && (await nowExists(issues, name))) {
				rows.push(row(name, name, "ok", "exists (made in the meantime)"));
			} else {
				rows.push(row(name, name, "fail", describeError(err)));
			}
		}
	}
	const status = rows.some((r) => r.status === "fail")
		? "fail"
		: rows.every((r) => r.status === "skip")
			? "skip"
			: "ok";
	return { status, rows, created, updated };
}

/** After a 409 or 422 on create: whether the name is in the organization's list now. */
async function nowExists(issues: Issues, name: string): Promise<boolean> {
	try {
		const list = (await issues.listTypes?.()) ?? [];
		return list.some((t) => t.name.toLowerCase() === name.toLowerCase());
	} catch {
		return false;
	}
}

/** The row of an action that is not carried out (a dry run, or the list shown before asking), or that needs none. */
function describeAction(action: TypeAction): CheckRow {
	const name = action.declared.name;
	if (action.kind === "create") return row(name, name, "skip", "would create");
	if (action.kind === "update") {
		const fields = action.changes.map((c) => c.field).join(", ");
		return row(
			name,
			name,
			"skip",
			`would update ${fields}`,
			action.changes.map((c) => `${c.field}: was ${JSON.stringify(c.was)}, to ${JSON.stringify(c.to)}`)
		);
	}
	return row(name, name, "ok", action.existing.enabled ? "exists" : "exists (turned off in the organization)");
}
