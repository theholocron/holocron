/**
 * `holocron apply issue-types` — make the organization's issue Types match the org area's `issueTypes`.
 *
 * The explicit, deliberate step beside `apply properties`: the Types are organization-wide, so it asks first (`--yes`
 * skips the question; without a terminal it refuses), `--dry-run` only reads, and it only ever adds a Type, or with
 * `--update` sets a differing description or colour. It never deletes, renames or turns a Type on or off. The work is
 * `ensureIssueTypes()`, which the `setup` step calls too.
 */

import { printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";

import { assertPluginsResolvable, type Issues, PluginLoader } from "../../../plugin/index.js";
import { ensureIssueTypes } from "../../issue-types/index.js";
import { whyMissing } from "../../notifications-channel-add/index.js";
import type { IssueTypesApplyReport, RunIssueTypesApplyInput } from "./run-issue-types-apply.type.js";

export async function runIssueTypesApply(input: RunIssueTypesApplyInput): Promise<IssueTypesApplyReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const declared = input.loaded.resolved.issueTypes;

	// No declaration means no write and no need for a provider, so none is loaded.
	let issues: Issues | undefined;
	let missingReason: string | undefined;
	if (declared && declared.length > 0) {
		const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
		await loader.load();
		assertPluginsResolvable(loader, "apply issue-types");
		issues = loader.has("issues") ? loader.get("issues") : undefined;
		missingReason = whyMissing(loader, "issues", "no `issues` provider to read the Types with");
	}

	const report = await ensureIssueTypes({
		declared,
		issues,
		caller: "apply",
		update: input.update === true,
		dryRun: input.context.dryRun === true,
		...(missingReason !== undefined ? { missingReason } : {}),
		...(input.yes ? { yes: true } : {}),
		...(input.interactive !== undefined ? { interactive: input.interactive } : {}),
		...(input.confirm ? { confirm: input.confirm } : {}),
	});
	printCheckRows(report.rows, print);
	printCheckSummary(summariseChecks(report.rows), print);
	return report;
}
