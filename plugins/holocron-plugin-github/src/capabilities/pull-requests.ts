import type {
	PullRequest,
	PullRequestFields,
	PullRequestInput,
	PullRequestLink,
	PullRequestPatch,
	PullRequestResult,
} from "@theholocron/cli";
import type { GitHubClient, GitHubPullRequest } from "@theholocron/github-client";

/** The GitHub pull request as the neutral {@link PullRequest}. */
export function toPullRequest(raw: GitHubPullRequest): PullRequest {
	return {
		number: raw.number,
		title: raw.title,
		state: raw.state,
		merged: raw.merged_at !== null,
		branch: raw.head.ref,
		headSha: raw.head.sha,
		url: raw.html_url,
	};
}

/** Whether a body already holds a closing or referencing line for the issue (any keyword, any case). */
function names(body: string, issue: string): boolean {
	const escaped = issue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\b(closes?|fix(es)?|resolves?|refs?)\\s+${escaped}(?![\\w-])`, "i").test(body);
}

/**
 * The body with the link line the issue's closing reference needs. GitHub reads `Closes #12` itself, so the link is
 * text, not a call; a body that already names the issue is left alone.
 */
export function withLink(body: string | undefined, link: PullRequestLink | undefined): string | undefined {
	if (!link) return body;
	const issue = link.issue.trim();
	const ref = /^\d+$/.test(issue) ? `#${issue}` : issue;
	const text = body ?? "";
	if (names(text, ref)) return body;
	const line = `${link.keyword ?? "Refs"} ${ref}`;
	return text.trim() === "" ? line : `${text.trimEnd()}\n\n${line}`;
}

/** The organization's boards, as `projectsV2` lists them. */
interface BoardsData {
	organization: { projectsV2: { nodes: Array<{ id: string; title: string; closed: boolean }> } } | null;
}

/** Puts the pull request (by node id) on each board of the organization found by title; a board not found or refused is returned by name. */
async function addToBoards(client: GitHubClient, repo: string, nodeId: string, titles: string[]): Promise<string[]> {
	const dropped: string[] = [];
	const owner = repo.slice(0, repo.indexOf("/"));
	let boards: BoardsData["organization"];
	try {
		const data = await client.graphql.query<BoardsData>(
			`query($owner: String!) { organization(login: $owner) { projectsV2(first: 100) { nodes { id title closed } } } }`,
			{ owner }
		);
		boards = data.organization;
	} catch {
		return titles.map((t) => `project ${t}`);
	}
	for (const title of titles) {
		const board = boards?.projectsV2.nodes.find((b) => b.title === title && !b.closed);
		if (!board) {
			dropped.push(`project ${title}`);
			continue;
		}
		try {
			// Adding an item already on the board answers with the existing item, so a rerun changes nothing.
			await client.graphql.query(
				`mutation($project: ID!, $content: ID!) { addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } } }`,
				{ project: board.id, content: nodeId }
			);
		} catch {
			dropped.push(`project ${title}`);
		}
	}
	return dropped;
}

/**
 * Puts the fields an issue and its pull request share on the pull request (GitHub serves a pull request through
 * the issues API for these): labels and assignees are added to what is there, a milestone is found by title and
 * boards by title. What cannot be applied comes back by name; nothing is created or cleared.
 */
async function applyFields(
	client: GitHubClient,
	repo: string,
	pr: GitHubPullRequest,
	fields: PullRequestFields & { removeLabels?: string[] }
): Promise<string[]> {
	const dropped: string[] = [];
	const { number } = pr;
	if (fields.labels?.length) await client.issues.addLabels(repo, number, fields.labels);
	for (const label of fields.removeLabels ?? []) {
		try {
			await client.issues.removeLabel(repo, number, label);
		} catch {
			// A label that is not on the pull request is what was asked for.
		}
	}
	const patch: Record<string, unknown> = {};
	if (fields.assignees?.length) {
		const current = await client.issues.getIssue(repo, number);
		const have = (current.assignees ?? []).map((a) => a.login);
		const want = fields.assignees.map((a) => a.replace(/^@/, ""));
		const next = [...new Set([...have, ...want])];
		if (next.length !== have.length) patch.assignees = next;
	}
	if (fields.milestone) {
		const found = (await client.issues.listMilestones(repo, { state: "open" })).find(
			(m) => m.title === fields.milestone
		);
		if (found) patch.milestone = found.number;
		else dropped.push(`milestone ${fields.milestone}`);
	}
	if (Object.keys(patch).length) await client.issues.updateIssue(repo, number, patch);
	if (fields.projects?.length) {
		if (pr.node_id) dropped.push(...(await addToBoards(client, repo, pr.node_id, fields.projects)));
		else dropped.push(...fields.projects.map((t) => `project ${t}`));
	}
	return dropped;
}

/** Opens a draft pull request, or returns the open one for the same head, and applies the mirrored fields. */
export async function createPullRequest(
	client: GitHubClient,
	repo: string,
	input: PullRequestInput
): Promise<PullRequestResult> {
	const existing = (await client.pulls.listOpenByHead(repo, input.head))[0];
	const created = !existing;
	const raw =
		existing ??
		(await client.pulls.createPullRequest(repo, {
			title: input.title,
			head: input.head,
			base: input.base,
			body: withLink(input.body, input.link),
			draft: input.draft ?? true,
		}));
	const dropped = await applyFields(client, repo, raw, input);
	return { pullRequest: toPullRequest(raw), created, draft: raw.draft ?? false, dropped };
}

/** Changes a pull request's own fields, then the mirrored ones. A patch that names none of the own fields makes no PATCH. */
export async function updatePullRequest(
	client: GitHubClient,
	repo: string,
	number: number,
	patch: PullRequestPatch
): Promise<PullRequestResult> {
	const own: Record<string, string> = {};
	if (patch.title !== undefined) own.title = patch.title;
	if (patch.body !== undefined) own.body = patch.body;
	if (patch.base !== undefined) own.base = patch.base;
	if (patch.state !== undefined) own.state = patch.state;
	const raw = Object.keys(own).length
		? await client.pulls.updatePullRequest(repo, number, own)
		: await client.pulls.getPullRequest(repo, number);
	const dropped = await applyFields(client, repo, raw, patch);
	return { pullRequest: toPullRequest(raw), created: false, draft: raw.draft ?? false, dropped };
}

/** Takes a draft out of draft; `false` when it was not a draft or is not open. */
export async function markReady(client: GitHubClient, repo: string, number: number): Promise<boolean> {
	const raw = await client.pulls.getPullRequest(repo, number);
	if (!raw.draft || raw.state !== "open") return false;
	if (!raw.node_id) throw new Error(`pull request ${repo}#${number} has no node id to mark ready`);
	await client.pulls.markReadyForReview(raw.node_id);
	return true;
}
