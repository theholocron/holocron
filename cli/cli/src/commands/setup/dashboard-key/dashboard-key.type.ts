import type { FileIdentity, GitIgnoreState, ShredOutcome } from "@theholocron/kyber/secrets";

/** What `handOffDashboardKey` needs; everything but `key`, `repoRoot` and `print` is for a test to replace. */
export interface HandOffDashboardKeyInput {
	/** The view key of a private dashboard: a credential, written to the private file and nowhere else. */
	key: string;
	/** The repository root; the file is `.holocron/.private/.credentials` under it. */
	repoRoot: string;
	/** Where the lines go. Names and paths only, never the key. */
	print: (line: string) => void;
	/** Whether there is a terminal to wait for the import on. Defaults to stdin being a terminal. */
	interactive?: boolean | undefined;
	platform?: NodeJS.Platform | undefined;
	makeDir?: ((dir: string) => void) | undefined;
	isIgnored?: ((path: string) => GitIgnoreState) | undefined;
	writeFile?: ((path: string, text: string, force: boolean) => FileIdentity) | undefined;
	shred?: ((path: string, identity: FileIdentity) => ShredOutcome) | undefined;
	waitForImport?: ((message: string) => Promise<unknown>) | undefined;
}
