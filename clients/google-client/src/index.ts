import { documents } from "./documents.js";
import { spreadsheets } from "./spreadsheets.js";

export { googleAuth, oauth } from "./authentication.js";
export type { Return } from "./types.js";

/** Read-only Google Docs and Sheets helpers, each authenticated with the service account. */
export const google = {
	/** Google Docs helpers. */
	documents,
	/** Google Sheets helpers. */
	spreadsheets,
};
