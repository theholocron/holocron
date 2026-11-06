import type { OptionAnswer, OptionPrompt } from "../../prompts/index.js";

/**
 * `option`'s own argv tokens for `value` (never called for a `secret`
 * option — those are delivered via {@link secretEnv} instead, never argv).
 *
 * - boolean `true` → `--flag`; `false` → `--no-flag` when the yargs
 *   default is `true` (`negatable: true` — answering "no" must actively
 *   override it, not just omit the flag and silently keep the default),
 *   otherwise omitted (the yargs default is already `false`).
 * - string/select → `--flag value`, omitted when empty.
 * - `arity`-valued array → `--flag v1 v2 ...`.
 */
export function optionArgv(option: OptionPrompt, value: OptionAnswer | undefined): string[] {
	if (value === undefined) return [];
	if (typeof value === "boolean") {
		if (value) return [option.flag];
		return option.negatable ? [`--no-${option.flag.replace(/^--/, "")}`] : [];
	}
	if (Array.isArray(value)) return value.length === 0 ? [] : [option.flag, ...value];
	return value === "" ? [] : [option.flag, value];
}
