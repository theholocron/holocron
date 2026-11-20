import type { GitHubClient, GitHubIssue } from "@theholocron/github-client";

import { fieldRefusal } from "../../capabilities/issue-field-setter.js";
import { GitHubProjects } from "../../capabilities/projects.js";
import type { BackfillApi, BackfillItem } from "./issue-types.type.js";

const PAGE = 100;

const PROJECTS_OF = `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Issue { id projectItems(first: 20) { nodes { project { id } } } } } }`;
const ADD_ITEM = `mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } } }`;

interface ProjectsData {
	nodes: Array<{ id?: string; projectItems?: { nodes: Array<{ project: { id: string } }> } } | null>;
}

function toItem(issue: GitHubIssue): BackfillItem {
	return {
		number: issue.number,
		title: issue.title,
		state: issue.state,
		labels: issue.labels.map((l) => l.name),
		type: issue.type?.name ?? null,
		milestone: issue.milestone ?? null,
		nodeId: issue.node_id ?? "",
		isPullRequest: issue.pull_request !== undefined,
		createdAt: issue.created_at ?? "",
	};
}

/**
 * The backfill's reads and writes over the GitHub client. `client` reads and writes issues (the `github.issues` token);
 * `orgClient` reads and writes the organization's projects (the `github.org` token). Each method is the one call, or the
 * fixed few, its name says, so the probe's logic is tested against a fake of {@link BackfillApi} and this stays thin.
 */
export function createBackfillApi(client: GitHubClient, orgClient: GitHubClient, repo: string): BackfillApi {
	const org = repo.split("/")[0];
	const projects = new GitHubProjects(orgClient.graphql, { repo });
	let fieldList: ReturnType<typeof client.issueFields.list> | undefined;
	const fields = async () => (fieldList ??= client.issueFields.list(org));

	return {
		async list(page) {
			const batch = await client.issues.listIssues(repo, {
				state: "all",
				sort: "created",
				direction: "asc",
				per_page: PAGE,
				page,
			});
			return batch.map(toItem);
		},
		async get(number) {
			return toItem(await client.issues.getIssue(repo, number));
		},
		async parent(number) {
			const parent = await client.issues.getParent(repo, number);
			return parent ? { number: parent.number, milestone: parent.milestone?.number ?? null } : null;
		},
		async labelNames() {
			return new Set((await client.labels.listLabels(repo)).map((l) => l.name.toLowerCase()));
		},
		async milestoneNumber(title) {
			const all = await client.issues.listMilestones(repo, { state: "all" });
			return all.find((m) => m.title.toLowerCase() === title.toLowerCase())?.number;
		},
		async projectId(title) {
			return (await projects.find(org, title))?.id;
		},
		async projectsOf(nodeIds) {
			const data = await orgClient.graphql.query<ProjectsData>(PROJECTS_OF, { ids: nodeIds });
			const out = new Map<string, string[]>();
			for (const node of data.nodes) {
				if (node?.id)
					out.set(
						node.id,
						(node.projectItems?.nodes ?? []).map((i) => i.project.id)
					);
			}
			return out;
		},
		async fieldNames() {
			try {
				return new Set((await fields()).map((f) => f.name.toLowerCase()));
			} catch (err) {
				const why = fieldRefusal(err);
				if (why === undefined) throw err;
				return why;
			}
		},
		async fieldValues(number) {
			const byId = new Map((await fields()).map((f) => [f.id, f.name.toLowerCase()]));
			const values = await client.issueFields.values(repo, number);
			return new Set(values.map((v) => v.issue_field_name?.toLowerCase() ?? byId.get(v.issue_field_id) ?? ""));
		},
		async files(number) {
			return (await client.pulls.listFiles(repo, number)).map((f) => f.filename);
		},
		async setType(number, type) {
			await client.issues.updateIssue(repo, number, { type });
		},
		async addLabels(number, labels) {
			await client.issues.addLabels(repo, number, labels);
		},
		async setMilestone(number, milestone) {
			await client.issues.updateIssue(repo, number, { milestone });
		},
		async addToProject(projectId, nodeId) {
			await orgClient.graphql.query(ADD_ITEM, { project: projectId, content: nodeId });
		},
	};
}
