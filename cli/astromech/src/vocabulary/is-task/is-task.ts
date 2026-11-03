import { resolveTaskName } from "../resolve-task-name/index.js";

/** `true` when a manifest name (a flat id or an old dotted name) stands for the given flat id. */
export function isTask(name: string, id: string): boolean {
	return resolveTaskName(name).some((target) => target.id === id);
}
