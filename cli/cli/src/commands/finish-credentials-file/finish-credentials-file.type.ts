import { type FileIdentity, type ShredOutcome } from "@theholocron/kyber/secrets";

/** What {@link finishCredentialsFile} needs to know about the file it was handed and how to talk about it. */
export interface FinishCredentialsFileInput {
	/** The private file that was just written. */
	path: string;
	/** The identity of the file as written: the descriptor held for its cleanup, and the device and inode. */
	identity: FileIdentity;
	/** Where the lines go. Names and paths only, never a value. */
	print: (line: string) => void;
	/** What the file holds, for the warnings: `your tokens`, `the app's credentials`. */
	holds: string;
	/** The line that says how to import the file. */
	importHint: string;
	/** Leave the file in place instead of deleting it once the import is done. */
	keep?: boolean | undefined;
	/** Whether there is a terminal to ask on. Without one the file is left and the command says to delete it. */
	interactive?: boolean | undefined;
	/** Overwrites and removes the file it was written as. Defaults to `shredFile`. */
	shred?: ((path: string, identity: FileIdentity) => ShredOutcome) | undefined;
	/** Waits for the user to finish importing. Defaults to waiting for Enter on the terminal. */
	waitForImport?: ((message: string) => Promise<unknown>) | undefined;
}
