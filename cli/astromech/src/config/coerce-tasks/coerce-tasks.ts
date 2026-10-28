import type { TasksInput } from "../load/index.js";
import type { TasksConfig } from "../schema/index.js";

/** A bare item array is shorthand for `{ tasks: [...] }`. */
export function coerceTasks(value: TasksInput | undefined): TasksConfig | undefined {
	if (value == null) return undefined;
	return Array.isArray(value) ? { tasks: value } : value;
}
