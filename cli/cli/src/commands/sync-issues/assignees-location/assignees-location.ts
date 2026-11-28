/** Where the assignees file is: the org's private config repo, as the Discord links file is. */
export function assigneesLocation(org: string | undefined): { repo: string; path: string } {
	if (!org)
		throw new Error("no org to find the assignees file under — set `org` in holocron.config.ts or pass --org");
	return { repo: `${org}/.github-private`, path: "issues/assignees.json" };
}
