import { type Connection, type LinearGraphQL, paginate } from "../graphql/graphql.js";
import type {
	LinearAttachment,
	LinearComment,
	LinearIssue,
	LinearIssueCreate,
	LinearIssueFilter,
	LinearIssueUpdate,
} from "../types.js";

const REL = "id type relatedIssue { id identifier }";
const INVERSE_REL = "id type issue { id identifier state { type } }";

/** The fields every issue read returns. */
export const ISSUE_FIELDS = `id identifier number title description priority priorityLabel estimate dueDate url
	createdAt updatedAt completedAt canceledAt
	state { id name type } team { id key }
	assignee { id name displayName email }
	labels(first: 50) { nodes { id name } }
	project { id name } parent { id identifier }
	attachments(first: 25) { nodes { url title } }
	relations(first: 50) { nodes { ${REL} } }
	inverseRelations(first: 50) { nodes { ${INVERSE_REL} } }`;

function toFilter(f: LinearIssueFilter): Record<string, unknown> {
	return {
		...(f.teamId ? { team: { id: { eq: f.teamId } } } : {}),
		...(f.projectId ? { project: { id: { eq: f.projectId } } } : {}),
		...(f.assigneeId ? { assignee: { id: { eq: f.assigneeId } } } : {}),
		...(f.openOnly ? { state: { type: { nin: ["completed", "canceled"] } } } : {}),
	};
}

/** Issues, their comments, relations and attached links. */
export function issues(gql: LinearGraphQL) {
	return {
		/** Issues matching the filter, newest update first; stops at `limit`. */
		async list(filter: LinearIssueFilter = {}): Promise<LinearIssue[]> {
			const pageSize = Math.min(filter.limit ?? 100, 100);
			const found: LinearIssue[] = [];
			let after: string | null = null;
			for (;;) {
				const data: { issues: Connection<LinearIssue> } = await gql.query<{ issues: Connection<LinearIssue> }>(
					`query($after: String, $first: Int!, $filter: IssueFilter) { issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt) {
						nodes { ${ISSUE_FIELDS} } pageInfo { hasNextPage endCursor } } }`,
					{ after, first: pageSize, filter: toFilter(filter) }
				);
				found.push(...data.issues.nodes);
				const { hasNextPage, endCursor } = data.issues.pageInfo;
				if (!hasNextPage || !endCursor || (filter.limit !== undefined && found.length >= filter.limit)) {
					return filter.limit === undefined ? found : found.slice(0, filter.limit);
				}
				after = endCursor;
			}
		},

		/** One issue by `ENG-42` or by id. */
		async get(ref: string): Promise<LinearIssue> {
			const data = await gql.query<{ issue: LinearIssue }>(
				`query($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
				{ id: ref }
			);
			return data.issue;
		},

		/** Makes an issue. */
		async create(input: LinearIssueCreate): Promise<LinearIssue> {
			const data = await gql.query<{ issueCreate: { issue: LinearIssue } }>(
				`mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { ${ISSUE_FIELDS} } } }`,
				{ input }
			);
			return data.issueCreate.issue;
		},

		/** Changes the fields given and leaves the rest. */
		async update(id: string, input: LinearIssueUpdate): Promise<LinearIssue> {
			const data = await gql.query<{ issueUpdate: { issue: LinearIssue } }>(
				`mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { issue { ${ISSUE_FIELDS} } } }`,
				{ id, input }
			);
			return data.issueUpdate.issue;
		},

		/** Every comment on the issue, oldest first. */
		async comments(issueId: string): Promise<LinearComment[]> {
			return paginate((after) =>
				gql
					.query<{ issue: { comments: Connection<LinearComment> } }>(
						`query($id: String!, $after: String) { issue(id: $id) { comments(first: 100, after: $after) {
							nodes { id body createdAt user { id name displayName } } pageInfo { hasNextPage endCursor } } } }`,
						{ id: issueId, after }
					)
					.then((d) => d.issue.comments)
			);
		},

		/** Adds a comment; `createdAt` backdates it. */
		async comment(issueId: string, body: string, createdAt?: string): Promise<LinearComment> {
			const data = await gql.query<{ commentCreate: { comment: LinearComment } }>(
				`mutation($input: CommentCreateInput!) { commentCreate(input: $input) { comment { id body createdAt user { id name displayName } } } }`,
				{ input: { issueId, body, ...(createdAt ? { createdAt } : {}) } }
			);
			return data.commentCreate.comment;
		},

		/** Relates two issues: `blocks` means `issueId` blocks `relatedIssueId`. */
		async relate(issueId: string, relatedIssueId: string, type: "blocks" | "duplicate" | "related"): Promise<void> {
			await gql.query(
				`mutation($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success } }`,
				{ input: { issueId, relatedIssueId, type } }
			);
		},

		/** Attaches a link to the issue. Linear keeps one attachment per issue and url. */
		async attach(issueId: string, url: string, title: string): Promise<void> {
			await gql.query(
				`mutation($issueId: String!, $url: String!, $title: String) { attachmentLinkURL(issueId: $issueId, url: $url, title: $title) { success } }`,
				{ issueId, url, title }
			);
		},

		/** The attachments with exactly this url, which is how a migration finds what it already made. */
		async attachmentsForUrl(url: string): Promise<LinearAttachment[]> {
			const data = await gql.query<{ attachmentsForURL: Connection<LinearAttachment> }>(
				`query($url: String!) { attachmentsForURL(url: $url) { nodes { id url title issue { id identifier } } pageInfo { hasNextPage endCursor } } }`,
				{ url }
			);
			return data.attachmentsForURL.nodes;
		},
	};
}
