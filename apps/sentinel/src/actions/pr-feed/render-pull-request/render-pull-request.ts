import { ageText } from "../age-text/index.js";
import type { PullRequestState, RenderedPullRequest } from "../pr-feed.type.js";
import { pullRequestTag } from "../pull-request-tag/index.js";

/** Discord's limit on a post's title. */
const TITLE_LIMIT = 100;

const CI_TEXT: Record<PullRequestState["ci"], string> = {
	passing: "passing",
	failing: "failing",
	pending: "running",
	none: "no result yet",
};

function cut(text: string): string {
	return text.length <= TITLE_LIMIT ? text : `${text.slice(0, TITLE_LIMIT - 1)}…`;
}

function reviewText(state: PullRequestState): string {
	if (state.review === "approved") return "approved";
	if (state.review === "changes_requested") return "changes requested";
	if (state.requestedReviewers.length > 0) return `waiting on review from ${state.requestedReviewers.join(", ")}`;
	return "waiting on review";
}

/**
 * The post for a pull request: its title, the summary that is the first message (edited in place, no footer) and its
 * tag. A pure function of the current state; the caller fetches it, and the provider adds the sync footer.
 */
export function renderPullRequest(state: PullRequestState, now: Date): RenderedPullRequest {
	const tag = pullRequestTag(state);
	const name = state.repo.slice(state.repo.indexOf("/") + 1);
	const author = state.authorIsBot ? `${state.author} (bot)` : state.author;
	const status = state.merged ? "merged" : state.closed ? "closed" : state.draft ? "draft" : reviewText(state);
	const lines = [
		`**[${state.repo}#${state.number} ${state.title}](${state.url})**`,
		`by ${author} into \`${state.base}\`, opened ${ageText(state.createdAt, now)}`,
		`Status: ${status}`,
		`CI: ${CI_TEXT[state.ci]}`,
	];
	if (state.mergeable === "conflicting") lines.push(`Conflicts with \`${state.base}\``);
	return { title: cut(`${name}#${state.number} ${state.title}`), body: lines.join("\n"), tag };
}
