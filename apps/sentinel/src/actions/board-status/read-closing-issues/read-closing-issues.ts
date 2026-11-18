import type { ClosingIssues, ReadClosingIssuesInput } from "./read-closing-issues.type.js";

const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
	repository(owner: $owner, name: $name) {
		pullRequest(number: $number) {
			closingIssuesReferences(first: 50) { nodes { number repository { nameWithOwner } } }
		}
	}
}`;

interface Response {
	repository: {
		pullRequest: {
			closingIssuesReferences: { nodes: { number: number; repository: { nameWithOwner: string } }[] };
		} | null;
	} | null;
}

/**
 * The issues a pull request closes, read from the GraphQL API (never from the webhook payload, which carries the
 * description's text and not GitHub's own parse of `Closes #N`). A pull request GitHub no longer finds closes none.
 */
export async function readClosingIssues(input: ReadClosingIssuesInput): Promise<ClosingIssues> {
	const [owner, name] = input.repo.split("/");
	const data = await input.client.graphql.query<Response>(QUERY, { owner, name, number: input.number });
	const pull = data.repository?.pullRequest;
	if (!pull) return { issues: [] };
	return {
		issues: pull.closingIssuesReferences.nodes.map((n) => ({ repo: n.repository.nameWithOwner, number: n.number })),
	};
}
