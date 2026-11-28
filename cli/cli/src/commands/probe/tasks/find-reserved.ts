import { RESERVED_SCRIPT_NAMES } from "@theholocron/astromech";

import { scriptKeys } from "./script-keys.js";
import type { Leftover, ScannedFile } from "./tasks.type.js";

/** What to use instead of a reserved script name: `publish` has a task of its own, the rest are never tasks. */
function instead(name: string): string {
	return name === "publish"
		? "release (`publish` is reserved by npm and pnpm)"
		: "(reserved by npm and pnpm, never a task)";
}

/**
 * Every `package.json` script named like an npm/pnpm lifecycle word (`RESERVED_SCRIPT_NAMES`): `pnpm publish` would run
 * it after publishing. The root `prepare` (husky) is the one allowed.
 */
export function findReserved(file: ScannedFile): Leftover[] {
	if (!/(^|\/)package\.json$/.test(file.path)) return [];
	return scriptKeys(file.text, "scripts")
		.filter(({ key }) => RESERVED_SCRIPT_NAMES.has(key) && !(file.path === "package.json" && key === "prepare"))
		.map(({ key, line }) => ({ file: file.path, line, old: key, replacement: instead(key) }));
}
