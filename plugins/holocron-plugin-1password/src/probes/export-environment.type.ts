import type { AuthExportOutKind } from "@theholocron/cli";
import type { FileIdentity, GitIgnoreState, ShredOutcome } from "@theholocron/kyber/secrets";

/** Everything `export-environment` touches outside itself, so a test can fake each piece and no real `op`, file or clipboard is used. */
export interface ExportEnvironmentDeps {
	/** The variables of an Environment, with values (the `credentials` capability's reader). */
	read(environment: string): Promise<Record<string, string>>;
	/** The repository root: the directory whose `.holocron/.private/` holds the `.credentials` file, and where a layer word finds its remote. */
	repoRoot: string;
	/** Turns a layer word (`prod`) into the Environment it names; any other text comes back as written. */
	resolveId(id: string, repoRoot: string): Promise<string>;
	/** What stdout is: only a `pipe` may receive the lines. */
	outKind(): AuthExportOutKind;
	/** Writes the lines to stdout. */
	out(text: string): void;
	/** Puts text on the clipboard. */
	copy(text: string): Promise<void>;
	/** Writes the private file and says which file it is. */
	writeFile(path: string, text: string, force: boolean): FileIdentity;
	/** Overwrites and removes the file it was written as. */
	shred(path: string, identity: FileIdentity): ShredOutcome;
	/** Makes the private directory when it is missing. Unset, `mkdir -p` with mode 0700. */
	makeDir?: (dir: string) => void;
	/** What git says about the path. */
	isIgnored(path: string): GitIgnoreState;
	/** The platform, for refusing the file where its mode means nothing. */
	platform: string;
	/** Whether there is a terminal to ask on; the file needs one to wait for the import. */
	interactive: boolean;
	/** Waits for the maintainer to finish importing. Unset, Enter on the terminal. */
	waitForImport?: (message: string) => Promise<unknown>;
}

/** What the person typed after `export-environment`. */
export interface ExportEnvironmentArgs {
	/** The Environment name, id or layer word. */
	environment: string;
	/** `--only`: the variable names to export; empty for all. */
	only: string[];
	/** `--copy`: use the clipboard. */
	copy: boolean;
}
