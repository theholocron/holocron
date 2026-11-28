import type { FileIdentity, GitIgnoreState, ShredOutcome } from "@theholocron/kyber/secrets";

/** One heartbeat's ping URL, to be written for the 1Password import. The URL is a credential. */
export interface HeartbeatPing {
	/** The heartbeat's name. */
	name: string;
	/** The address the job calls on success. Never printed, logged or kept past the file. */
	url: string;
}

export interface HandOffHeartbeatsInput {
	/** The pings to hand over, one per heartbeat made in this run. */
	pings: readonly HeartbeatPing[];
	/** The repository root the private directory sits under. */
	base: string;
	/** Where the lines go. Names and paths only, never a URL. */
	print: (line: string) => void;
	/** Leave the file in place instead of deleting it once the import is done. */
	keep?: boolean;
	/** Whether there is a terminal to ask on. Without one the file is left and the run says to delete it. */
	interactive?: boolean;
	/** Writes the private file. Defaults to `writeCredentialsFile`. */
	writeFile?: (path: string, text: string, force: boolean) => FileIdentity;
	/** Overwrites and removes the file it was written as. Defaults to `shredFile`. */
	shred?: (path: string, identity: FileIdentity) => ShredOutcome;
	/** Makes the private directory. Defaults to `mkdirSync` with owner-only access. */
	makeDir?: (dir: string) => void;
	/** Asks git whether it ignores the file. Defaults to `isGitIgnored`. */
	isIgnored?: (path: string) => GitIgnoreState;
	/** The platform, for refusing the file where its mode means nothing. Defaults to the running one. */
	platform?: string;
	/** Waits for the user to finish importing. Defaults to waiting for Enter on the terminal. */
	waitForImport?: (message: string) => Promise<unknown>;
}

export interface HandOffHeartbeatsResult {
	/** `ok` when the file was written and dealt with, `skip` when there was nothing to hand over, `fail` otherwise. */
	status: "ok" | "skip" | "fail";
	/** The secret names written (never the values). */
	written: string[];
	/** Why it failed or was skipped. */
	reason?: string;
}
