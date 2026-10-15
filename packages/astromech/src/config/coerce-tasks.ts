import type { TasksInput } from "./load.type.js";
import type { TasksConfig } from "./schema.type.js";

/** A bare item array is shorthand for `{ tasks: [...] }`. */
export function coerceTasks(value: TasksInput | undefined): TasksConfig | undefined {
	if (value == null) return undefined;
	return Array.isArray(value) ? { tasks: value } : value;
}
