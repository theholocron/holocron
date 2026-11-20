import type { TrackerUser } from "../../../plugin/index.js";

/**
 * The login a pull request can be assigned to for an issue's assignee. A user carries a `login` when the tracker is not
 * the one that hosts the pull request and a mapping found it; when the issue and the pull request are in the same
 * tracker (GitHub both) the user's `id` is the login. `undefined` when there is none to use (a Linear assignee with
 * no mapping), so the pull request is left unassigned rather than guessed.
 */
export function workAssignee(
	user: TrackerUser | null | undefined,
	issuesProvider: string,
	sourceProvider: string
): string | undefined {
	if (!user) return undefined;
	if (user.login) return user.login;
	return issuesProvider === sourceProvider ? user.id : undefined;
}
