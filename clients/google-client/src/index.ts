import { documents } from "./documents.js";
import { spreadsheets } from "./spreadsheets.js";

export { oauth, googleAuth } from "./authentication.js";
export type { Return } from "./types.js";

export const google = {
	documents,
	spreadsheets,
};
