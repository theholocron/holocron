import { legacyName } from "../legacy-name/index.js";
import { LEGACY_NAMES } from "../legacy-names/index.js";

/**
 * The key of the workflow that carries `name` in a repo that still calls the frozen reusables in `theholocron/.github`
 * (the legacy-name gate): a flat id that shared an old workflow with others (`lint:markdown` and `format` with
 * `lint:editorconfig`, the old `sourceQuality.formatting`) maps to the first of them, because only that one has a
 * frozen reusable. Every other name is its own key, an old name mapping to its first successor.
 */
export function legacyWorkflowKey(name: string): string {
	const legacy = LEGACY_NAMES[name] ? name : legacyName(name);
	return legacy === undefined ? name : LEGACY_NAMES[legacy]![0]!.id;
}
