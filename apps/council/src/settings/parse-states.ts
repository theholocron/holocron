import { DEFAULT_SETTINGS } from "./default-settings.js";
import type { IdeasSettings, ParsedStates } from "./settings.type.js";

/**
 * Reads the states setting. A comma-separated list is trimmed, emptied of blanks and de-duplicated; an empty list
 * falls back to the defaults. The filing state is added at the end when the list leaves it out, and a blank filing
 * state falls back to the default one, so the picker can always set the state that files.
 */
export function parseStates(settings: Pick<IdeasSettings, "states" | "fileState">): ParsedStates {
	const listed = settings.states
		.split(",")
		.map((state) => state.trim())
		.filter((state) => state !== "");
	const states = [...new Set(listed.length > 0 ? listed : DEFAULT_SETTINGS.states.split(", "))];
	const fileState = settings.fileState.trim() || DEFAULT_SETTINGS.fileState;
	if (!states.includes(fileState)) states.push(fileState);
	return { states, fileState };
}
