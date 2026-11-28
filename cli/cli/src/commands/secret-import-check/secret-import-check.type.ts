/** What one read of a secret in a vault Environment showed. Holds a salted hash, never the value. */
export type EnvironmentRead =
	/** The name was there; `fingerprint` is `undefined` when its value is blank, and the name is `missing` when absent. */
	| { status: "read"; fingerprint: string | undefined; missing: boolean }
	/** The Environment could not be read (no vault, no read method, or the read failed), with the reason. */
	| { status: "unreadable"; why: string };

/** The verdict on an import: did the Environment end up holding a new value? */
export interface ImportVerdict {
	/** `ok` the value changed, `fail` it did not, `skip` nothing could be compared. */
	status: "ok" | "fail" | "skip";
	/** One line for the user. Names only, never a value. */
	message: string;
}
