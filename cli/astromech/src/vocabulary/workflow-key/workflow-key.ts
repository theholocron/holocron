import { legacyName } from "../legacy-name/index.js";
import { LEGACY_NAMES } from "../legacy-names/index.js";

/**
 * The key a manifest name has in the workflow tables (`WORKFLOW_TEMPLATES`, `WORKFLOW_CHECK_CONTEXTS`) and in the
 * generated file names: the old name, until the later phases flip them. An old name is its own key; a flat id maps back
 * to the old name it replaced; a name with neither (`preview`) is its own key.
 */
export function workflowKey(name: string): string {
	return LEGACY_NAMES[name] ? name : (legacyName(name) ?? name);
}
