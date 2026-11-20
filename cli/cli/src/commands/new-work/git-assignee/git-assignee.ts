const NOREPLY = /^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/;

/**
 * The GitHub login of the person at this machine, from git's own config (spec `tool-work-commands`, Decisions 4: the
 * default assignee is the git config user, never the token's identity, which is a bot under an agent). `read` answers
 * one config key. `github.user` is the login when set; otherwise a `users.noreply.github.com` email names it. A
 * `user.name` is a display name, not a login, so it is never guessed from; with neither, there is no default.
 */
export function gitAssignee(read: (key: string) => string | undefined): string | undefined {
	const login = read("github.user")?.trim();
	if (login) return login;
	return NOREPLY.exec(read("user.email")?.trim() ?? "")?.[1];
}
