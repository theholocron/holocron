import type { ResolvedOptions } from "../../prompts/index.js";
import { forwardedFlags } from "../forwarded-flags/index.js";
import { isSecretOption } from "../is-secret-option/index.js";
import type { MenuEntry } from "../menu-entry/index.js";
import { optionArgv } from "../option-argv/index.js";

/**
 * `entry.spawnArgs` if set, else `entry.name` split into tokens — resolved
 * positionals, then non-secret option flags, then forwarded flags, appended
 * in that order. `resolved` is whatever `promptForOptions` returned —
 * for a `modes`-based command, that's already the picked mode's own options
 * (plus a synthetic entry for its `flag`, if any), so this renders either
 * shape identically with no need to know which kind of command it came from.
 */
export function buildChildArgv(
	entry: MenuEntry,
	positionals: string[],
	resolved: ResolvedOptions,
	parentArgv: Record<string, unknown>,
	dryRunOverride?: boolean
): string[] {
	const optionArgs = resolved.options.flatMap((option) =>
		isSecretOption(option) ? [] : optionArgv(option, resolved.answers[option.key])
	);
	return [
		...(entry.spawnArgs ?? entry.name.split(" ")),
		...positionals,
		...optionArgs,
		...forwardedFlags(parentArgv, dryRunOverride),
	];
}
