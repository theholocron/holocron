import { CODE, is } from "./konami.ts";

export { errorMessage } from "./error-message.ts";
export type { TKonamiCode } from "./konami.ts";

/** Konami code helpers. */
export const konami = {
	/** The Konami code key sequence, as `KeyboardEvent.code` values. */
	CODE,
	/**
	 * Feeds a key event into the sequence and returns `true` when it completes the Konami code; a wrong key resets progress.
	 * The progress is module-level state shared by every caller, so use one listener per page.
	 *
	 * @example
	 * ```ts
	 * import { konami } from "@theholocron/misc-utils";
	 *
	 * document.addEventListener("keydown", (event) => {
	 * 	if (konami.is(event)) console.log("Konami Code entered!");
	 * });
	 * ```
	 */
	is,
};
