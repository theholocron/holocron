import { normalizeTaskEntry, type TasksConfig } from "../../config/schema/index.js";

/** Every configured task whose name starts with `"<namespace>."`, in manifest declaration order. */
export function matchNamespace(config: TasksConfig, namespace: string): string[] {
	const prefix = `${namespace}.`;
	return (config.tasks ?? []).map(normalizeTaskEntry).reduce<string[]>((names, entry) => {
		if (entry.name.startsWith(prefix) && !names.includes(entry.name)) names.push(entry.name);
		return names;
	}, []);
}
