import type { CheckRow } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import type { OrgIssueType } from "../../../config/index.js";
import { type Issues, ProviderApiError } from "../../../plugin/index.js";
import { missingTokenReason } from "../../missing-token/index.js";
import { compareIssueTypes } from "./issue-types-check.js";

const base = { id: "issue-types", title: "issue Types match the declaration" };
const UNREADABLE =
	"the organization's issue Types cannot be read with this token (it needs the organization's Issue types: read permission)";

const skip = (detail: string): CheckRow => ({ ...base, status: "skip", detail, problems: [] });

/**
 * The `issue-types` row of `doctor repo` (spec `tech-org-issue-types`, section 5): the declaration against the
 * organization's Types, read through the `issues` provider. Every way it cannot be read (no declaration, no
 * provider, no `listTypes`, no token, a 401 or 403, an unreadable list) is a skip with the reason; only an error that
 * is not about access fails. Names and counts only, never a token or an id.
 */
export async function issueTypesRow(
	declared: readonly OrgIssueType[] | undefined,
	issues: Pick<Issues, "listTypes"> | undefined,
	whyNoIssues: string
): Promise<CheckRow> {
	if (!declared || declared.length === 0) return skip("no `issueTypes` declared in the org area");
	if (!issues) return skip(whyNoIssues);
	if (typeof issues.listTypes !== "function") return skip("provider does not implement listTypes");
	let found;
	try {
		found = await issues.listTypes();
	} catch (err) {
		const noToken = missingTokenReason(err);
		if (noToken !== undefined) return skip(noToken);
		if (err instanceof ProviderApiError && (err.status === 401 || err.status === 403)) return skip(UNREADABLE);
		return { ...base, status: "fail", detail: errorMessage(err), problems: [] };
	}
	if (found === undefined) return skip(UNREADABLE);
	const result = compareIssueTypes(declared, found);
	const note = result.info && result.info.length > 0 ? `; info: ${result.info.join("; ")}` : "";
	if (result.problems.length > 0) {
		return {
			...base,
			status: "fail",
			detail: `${result.problems.length} problem(s)${note}`,
			problems: result.problems,
		};
	}
	return { ...base, status: "ok", detail: `${result.checked} of ${result.checked} match${note}`, problems: [] };
}
