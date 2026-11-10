/** The shells whose syntax the login-shell script (`cd -- '…' && 'word' … "$@"`) is written in. */
const POSIX_SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

/** The last component of a shell's path: `/bin/zsh` is `zsh`. */
export function shellName(shell: string): string {
	return shell.slice(shell.lastIndexOf("/") + 1);
}

/** True for a shell of the POSIX family; fish, nushell and the like read the script differently. */
export function isPosixShell(shell: string): boolean {
	return POSIX_SHELLS.has(shellName(shell));
}
