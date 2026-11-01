import { CODE, is } from "./konami.ts";

export { errorMessage } from "./error-message.ts";
export type { TKonamiCode } from "./konami.ts";

/** Konami code helpers. */
export const konami = {
	/** The Konami code key sequence, as `KeyboardEvent.code` values. */
	CODE,
	/** Feeds a key event into the sequence and returns `true` when it completes the Konami code; a wrong key resets progress. */
	is,
};
