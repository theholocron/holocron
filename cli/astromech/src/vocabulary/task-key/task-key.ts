import { ownLegacyName } from "../legacy-name/index.js";
import { LEGACY_NAMES } from "../legacy-names/index.js";
import { scriptName } from "../script-name/index.js";

/** `true` when a manifest entry is spelled with an old dotted name (`verification.unitTests`). */
export function isLegacySpelling(name: string): boolean {
	return LEGACY_NAMES[name] !== undefined;
}

/**
 * The key a task has in `turbo.json` and, in a package, as the script that runs it (the two must be the same string):
 * its script spelling, unless the manifest spells the task with the old dotted name it replaced. Both vocabularies are
 * accepted for a window, and a repo's packages hold scripts named in the vocabulary its `tasks:` list speaks, so the key
 * follows the entry. Rewriting the list to flat ids is what moves a repo's turbo keys, and its package scripts with them.
 *
 * `name` is the manifest entry, `id` one of the flat ids it stands for (`sourceQuality.formatting` stands for three, and
 * none of them owns the name, so they are keyed by their ids).
 */
export function taskKey(name: string, id: string): string {
	return isLegacySpelling(name) ? (ownLegacyName(id) ?? scriptName(id)) : scriptName(id);
}
