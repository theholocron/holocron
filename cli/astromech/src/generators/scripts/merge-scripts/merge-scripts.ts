import type { MergedScripts } from "./merge-scripts.type.js";

/**
 * `true` for a script body this tool writes: a `turbo run …` call or a `holocron run … --` wrapper. Both call back into
 * the task machinery, so neither may stand for a package's own command (a root that is itself a package would loop).
 */
export function isGeneratedScript(command: string): boolean {
	return /^turbo run\b/.test(command) || /^[^&|;]*\brun [^&|;]* --$/.test(command);
}

/**
 * `existing` with `desired` set, key by key; every other script is left alone. `turboKeys` are the keys the repo's
 * `turbo.json` fans out (#747): for those, and for any script whose desired body is `turbo run …`, an existing script
 * that is not itself generated is left untouched. Root may be a directly buildable package with its own real command
 * (`tsc --noEmit`, `vitest run`) for that task, and overwriting it would send turbo into the root script, which calls
 * turbo again, forever. Every other key is generator-owned: a hand edit of it is drift.
 */
export function mergeScripts(
	existing: Readonly<Record<string, string>>,
	desired: Readonly<Record<string, string>>,
	turboKeys: ReadonlySet<string>
): MergedScripts {
	const scripts = { ...existing };
	const changed: string[] = [];
	for (const [name, command] of Object.entries(desired)) {
		const current = existing[name];
		const guarded = turboKeys.has(name) || command.startsWith("turbo run ");
		if (guarded && current !== undefined && !isGeneratedScript(current)) continue;
		if (current !== command) {
			scripts[name] = command;
			changed.push(name);
		}
	}
	return { scripts, changed: changed.sort() };
}
