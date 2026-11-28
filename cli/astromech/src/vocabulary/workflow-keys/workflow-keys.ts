import { TASKS } from "../../registry/index.js";
import { resolveTaskName } from "../resolve-task-name/index.js";
import { workflowKey } from "../workflow-key/index.js";

/**
 * The workflow keys a manifest name needs a thin caller for, without repeats and in run order: one per workflow that
 * carries the ids the name stands for. A name that stands for one id has one; `validate` has two, `validate:specs` and
 * `validate:docs`, because each leaf has a reusable workflow of its own, and `sourceQuality.formatting` has
 * `lint:editorconfig` and `lint:markdown` (its `format` step runs inside `lint:code`, which has no caller of its own for
 * it). A name that stands for no id (unknown) is its own key.
 */
export function workflowKeys(name: string): string[] {
	const ids = resolveTaskName(name).filter(({ id }) => TASKS[id]?.workflow !== false);
	const keys = [...new Set(ids.map(({ id }) => workflowKey(id)))];
	return keys.length > 0 ? keys : [workflowKey(name)];
}
