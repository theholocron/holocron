import type { IdeasSettings } from "../settings/settings.type.js";
import { expandHome } from "./expand-home.js";
import type { SyncCommand, SystemInfo } from "./filing.type.js";
import { isPosixShell, shellName } from "./posix-shell.js";
import { splitCommand } from "./split-command.js";

/**
 * Where a Mac keeps the tools a command like `pnpm exec holocron` needs (`node`, `pnpm`), which an app started from
 * the Dock does not see because it never read the shell's profile. The login shell is the sure fix; these are added to
 * the end of `PATH` as a net.
 */
export const FALLBACK_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];

/** The CLI's own arguments: what this plugin asks it to do. */
const SYNC_ARGS = ["ideas", "sync", "--yes"];

/** Wraps a word in single quotes for a POSIX shell; a `'` inside becomes `'\''`. */
export function shellQuote(word: string): string {
	return `'${word.replaceAll("'", `'\\''`)}'`;
}

/**
 * Step (c): the line that files the notes. `holocron sync ideas --yes` runs in the Holocron checkout, with the vault's
 * folder in `HOLOCRON_IDEAS_DIR` (the path differs per machine, so it is not in the config). No token is passed: the
 * CLI reads its own through its chain. A leading `~` in the repo path or a command word is the home folder, expanded
 * here because nothing else would. With `useLoginShell` the command runs inside `<shell> -ilc`, so `node` and `pnpm`
 * are found the way a terminal finds them; without it the program is started directly. Returns `undefined` when the
 * command setting has no words.
 */
export function buildSyncCommand(
	settings: Pick<IdeasSettings, "command" | "repoPath" | "useLoginShell">,
	vaultPath: string,
	currentPath: string,
	system: SystemInfo
): SyncCommand | undefined {
	const words = splitCommand(settings.command).map((word) => expandHome(word, system.home));
	const [program, ...rest] = words;
	if (program === undefined) return undefined;
	const path = [currentPath, ...FALLBACK_PATH].filter((part) => part !== "").join(":");
	const cwd = expandHome(settings.repoPath.trim(), system.home);
	const env = { HOLOCRON_IDEAS_DIR: vaultPath, PATH: path };
	const direct = { program, args: [...rest, ...SYNC_ARGS], cwd, env };
	if (!settings.useLoginShell) return direct;
	// fish, nushell and the like do not read this script; run directly and say so (see `unsupportedShell`).
	if (!isPosixShell(system.shell)) return { ...direct, unsupportedShell: shellName(system.shell) };
	// The user's startup files run before the script and may `cd`, so the script moves to the checkout itself.
	const script = `cd -- ${shellQuote(cwd)} && ${words.map(shellQuote).join(" ")} "$@"`;
	return { program: system.shell, args: ["-ilc", script, "holocron", ...SYNC_ARGS], cwd, env };
}
