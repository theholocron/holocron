import type { IssueRecord, TrackerUser } from "../../../plugin/index.js";
import type { AssigneeLink } from "../parse-assignees/index.js";

/**
 * Fills in the other tracker's name for each record's assignee from the assignees file: the GitHub `login` when the
 * assignee has an email (a Linear source), the `emailAddress` when the assignee's id is a login (a GitHub source). A
 * record with no assignee, or one the file does not name, is returned as it was, so the target reports it as not mapped.
 */
export function applyAssignees(records: IssueRecord[], links: AssigneeLink[]): IssueRecord[] {
	if (links.length === 0) return records;
	const byEmail = new Map(links.map((l) => [l.email.toLowerCase(), l]));
	const byLogin = new Map(links.map((l) => [l.login.toLowerCase(), l]));
	return records.map((record) => {
		const who = record.assignee;
		if (!who) return record;
		const link =
			(who.emailAddress ? byEmail.get(who.emailAddress.toLowerCase()) : undefined) ??
			byLogin.get(who.id.toLowerCase());
		if (!link) return record;
		const assignee: TrackerUser = {
			...who,
			login: link.login,
			...(who.emailAddress ? {} : { emailAddress: link.email }),
		};
		return { ...record, assignee };
	});
}
