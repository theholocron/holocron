/** The shell used when neither the account nor `SHELL` names an absolute path. */
export const DEFAULT_SHELL = "/bin/zsh";

/**
 * The user's login shell: the account's (reliable for an app started from the Dock, which has no `SHELL`), then
 * `SHELL`, then zsh. Only an absolute path counts.
 */
export function pickShell(accountShell: string | null | undefined, envShell: string | undefined): string {
	for (const candidate of [accountShell, envShell]) {
		if (candidate?.startsWith("/") === true) return candidate;
	}
	return DEFAULT_SHELL;
}
