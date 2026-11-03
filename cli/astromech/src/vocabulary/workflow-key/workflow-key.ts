import { TASKS } from "../../registry/index.js";
import { LEGACY_NAMES } from "../legacy-names/index.js";

/**
 * The key a manifest name has in the workflow tables (`WORKFLOW_TEMPLATES`, `WORKFLOW_CHECK_CONTEXTS`): the flat id of
 * the workflow that carries it. A flat id is its own key; an old name maps to the first id that replaced it
 * (`sourceQuality.formatting` is `lint:editorconfig`); a task with no workflow of its own maps to the workflow that
 * runs its check (`format` is `lint:code`, see `TaskDef.host`); a name with no old name (`preview`, an unknown one) is
 * its own key. See {@link legacyWorkflowKey} for the key a repo that still calls the frozen reusables uses.
 */
export function workflowKey(name: string): string {
	return LEGACY_NAMES[name]?.[0]?.id ?? TASKS[name]?.host ?? name;
}
