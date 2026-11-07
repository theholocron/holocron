import type { ServerInspection } from "../../plugin/index.js";

export interface BotPermissionChecksInput {
	/** The server as `inspect` read it, or undefined when it could not be read. */
	found: ServerInspection | undefined;
}
