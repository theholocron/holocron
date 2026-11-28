import type { CheckRow } from "@theholocron/kyber/ui";

import type { Issues } from "../../../plugin/index.js";
import { ensureIssueTypes } from "../../issue-types/index.js";
import { whyMissing } from "../../notifications-channel-add/index.js";
import type { SetupStatus, SetupStepResult } from "../run-step/index.js";
import type { IssueTypesStepInput } from "./issue-types-step.type.js";

function toStatus(row: CheckRow, dryRun: boolean): SetupStatus {
	if (row.status === "fail") return "fail";
	if (row.status === "skip") return dryRun && row.detail.startsWith("would") ? "dry-run" : "skip";
	return "ok";
}

/**
 * `holocron setup`'s step for the organization's issue Types (spec `tech-org-issue-types`, #2512): make each Type the
 * org area's `issueTypes` declares, through `ensureIssueTypes()` as the `setup` caller. It only adds a missing Type
 * (never `update`, never deletes), and a refusal, an unreadable list, the limit or no terminal without `--yes` is a
 * skip row, never a failure, so a contributor without the organization permission still gets a passing `setup`.
 * Nothing declared, no steps: setup's output is unchanged. `holocron apply issue-types` is the deliberate version.
 */
export async function issueTypesStep(input: IssueTypesStepInput): Promise<SetupStepResult[]> {
	if (!input.declared || input.declared.length === 0) return [];
	const { loader } = input;
	const issues: Issues | undefined = loader.has("issues") ? loader.get("issues") : undefined;
	const missingReason = whyMissing(loader, "issues", "no `issues` provider to read the Types with");
	const report = await ensureIssueTypes({
		declared: input.declared,
		issues,
		caller: "setup",
		update: false,
		dryRun: input.dryRun,
		missingReason,
		...(input.yes ? { yes: true } : {}),
		...(input.interactive !== undefined ? { interactive: input.interactive } : {}),
		...(input.confirm ? { confirm: input.confirm } : {}),
	});
	return report.rows.map((row) => ({
		capability: "issues",
		step: row.id === "issue-types:types" ? "issue types" : `issue type ${row.title}`,
		status: toStatus(row, input.dryRun),
		message: [row.detail, ...row.problems].filter(Boolean).join("; "),
	}));
}
