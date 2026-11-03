import { legacyName } from "../legacy-name/index.js";
import { LEGACY_NAMES } from "../legacy-names/index.js";

/**
 * The key a manifest name has in the workflow tables (`WORKFLOW_TEMPLATES`, `WORKFLOW_CHECK_CONTEXTS`): the flat id of
 * the template that carries its workflow. A flat id is its own key; an old name maps to the first id that replaced it
 * (`sourceQuality.formatting` is `lint:editorconfig`, the id its template is filed under); the other successors of a
 * shared workflow (`lint:markdown`, `format`) map to that same id; a name with no old name (`preview`, an unknown one)
 * is its own key.
 */
export function workflowKey(name: string): string {
	const legacy = LEGACY_NAMES[name] ? name : legacyName(name);
	return legacy === undefined ? name : LEGACY_NAMES[legacy]![0]!.id;
}
