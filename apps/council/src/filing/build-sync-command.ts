import type { IdeasSettings } from "../settings/settings.type.js";
import type { SyncCommand } from "./filing.type.js";
import { splitCommand } from "./split-command.js";

/**
 * Where a Mac keeps the tools a command like `pnpm exec holocron` needs (`node`, `pnpm`), which an app started from
 * the Dock does not see because it never read the shell's profile. The setting for the full command is the sure fix;
 * these are added to the end of `PATH` as a net.
 */
export const FALLBACK_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];

/**
 * Step (c): the line that files the notes. `holocron ideas sync --yes` runs in the Holocron checkout, with the vault's
 * folder in `HOLOCRON_IDEAS_DIR` (the path differs per machine, so it is not in the config). No token is passed: the
 * CLI reads its own through its chain. Returns `undefined` when the command setting has no words.
 */
export function buildSyncCommand(
	settings: Pick<IdeasSettings, "command" | "repoPath">,
	vaultPath: string,
	currentPath: string
): SyncCommand | undefined {
	const [program, ...rest] = splitCommand(settings.command);
	if (program === undefined) return undefined;
	const path = [currentPath, ...FALLBACK_PATH].filter((part) => part !== "").join(":");
	return {
		program,
		args: [...rest, "ideas", "sync", "--yes"],
		cwd: settings.repoPath.trim(),
		env: { HOLOCRON_IDEAS_DIR: vaultPath, PATH: path },
	};
}
