/** One line for a converter's issue, whatever shape it came in. */
export const describeIssue = (issue: unknown): string => {
	if (typeof issue === "string") return issue;
	if (issue !== null && typeof issue === "object" && "message" in issue && typeof issue.message === "string") {
		return issue.message;
	}
	return JSON.stringify(issue);
};
