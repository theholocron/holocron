import { resolveTaskName } from "@theholocron/astromech";

import type { AutoFixTask } from "./read-auto-fix.type.js";

/** The explicit `autoFix` boolean on an entry, or `undefined` when it has none (a non-boolean is ignored). */
function explicitAutoFix(task: AutoFixTask): boolean | undefined {
	const value = task.with?.["autoFix"];
	return typeof value === "boolean" ? value : undefined;
}

/**
 * Read the auto-fix opt-out (`with: { autoFix: boolean }`) from a `tasks:` list. The setting lives on the `format`
 * task. Names go through astromech's `resolveTaskName`, so the flat id `format` and the deprecated alias
 * `sourceQuality.formatting` both count; an alias with several successors (that one resolves to `lint:editorconfig`,
 * `lint:markdown` and `format`) counts as `format` because `format` is among them, and an alias without it does not.
 *
 * When both spellings are present the flat id wins: its explicit boolean is used, and the alias is read only when the
 * flat entry has none. Within one spelling the first entry with an explicit boolean wins. A value that is not a
 * boolean is ignored, so the result is `undefined` ("not declared") and the caller keeps its default.
 */
export function readAutoFix(tasks: readonly AutoFixTask[]): boolean | undefined {
	const onFormat = tasks.filter((task) => resolveTaskName(task.name).some(({ id }) => id === "format"));
	const flat = onFormat.filter((task) => task.name === "format");
	const alias = onFormat.filter((task) => task.name !== "format");
	return [...flat, ...alias].map(explicitAutoFix).find((value) => value !== undefined);
}
