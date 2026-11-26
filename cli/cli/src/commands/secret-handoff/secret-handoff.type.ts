import type { HandOffHeartbeatsInput } from "../heartbeat-handoff/index.js";

/** The seams of the private-file hand-off, shared with the heartbeat one; every one defaults to the real thing. */
type HandOffSeams = Omit<HandOffHeartbeatsInput, "pings">;

export interface HandOffSecretInput extends HandOffSeams {
	/** The secret's name, as the vault holds it (`CRON_SECRET`). */
	name: string;
	/** Its value: a credential, written only to the private file and never printed, logged or returned. */
	value: string;
	/** The Environment it is to be imported into, named in the hint. Without one the hint is generic. */
	environment?: string;
}

export interface HandOffSecretResult {
	/** `ok` when the file was written and dealt with, `fail` otherwise. */
	status: "ok" | "fail";
	/** Why it failed. */
	reason?: string;
}
