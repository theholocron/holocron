import type { OptionAnswer, OptionPrompt } from "../../ui/index.js";
import type { CommandEntry } from "../command-registry/index.js";

/**
 * `--token` (repeatable), `--org`, `--cwd`, `--dry-run` — the global flags a
 * menu-launched child should inherit from the parent invocation. Everything
 * else (command-specific options) was never captured by the top-level `$0`
 * handler in the first place, so there's nothing else to forward.
 *
 * `dryRunOverride`, when passed, wins over `argv.dryRun` — `launchMenu`'s
 * dry-run offer needs to force `--dry-run` on for the preview spawn and
 * force it back off for the real-run spawn that follows, regardless of
 * what was on the original invocation.
 */
export function forwardedFlags(argv: Record<string, unknown>, dryRunOverride?: boolean): string[] {
	const out: string[] = [];
	const tokens = argv.token as string[] | undefined;
	for (const t of tokens ?? []) out.push("--token", t);
	if (typeof argv.org === "string") out.push("--org", argv.org);
	if (typeof argv.cwd === "string") out.push("--cwd", argv.cwd);
	if (dryRunOverride ?? argv.dryRun === true) out.push("--dry-run");
	return out;
}

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
function optionArgv(option: OptionPrompt, value: OptionAnswer | undefined): string[] {
	if (value === undefined) return [];
	if (typeof value === "boolean") {
		if (value) return [option.flag];
		return option.negatable ? [`--no-${option.flag.replace(/^--/, "")}`] : [];
	}
	if (Array.isArray(value)) return value.length === 0 ? [] : [option.flag, ...value];
	return value === "" ? [] : [option.flag, value];
}

/** `entry.spawnArgs` if set, else `entry.name` split into tokens — resolved positionals, then non-secret option flags, then forwarded flags, appended in that order. */
export function buildChildArgv(
	entry: CommandEntry,
	positionals: string[],
	optionAnswers: Record<string, OptionAnswer>,
	parentArgv: Record<string, unknown>,
	dryRunOverride?: boolean
): string[] {
	const optionArgs = (entry.options ?? []).flatMap((option) =>
		option.secret ? [] : optionArgv(option, optionAnswers[option.key])
	);
	return [
		...(entry.spawnArgs ?? entry.name.split(" ")),
		...positionals,
		...optionArgs,
		...forwardedFlags(parentArgv, dryRunOverride),
	];
}

/**
 * Secret option answers, keyed by the env var their handler reads instead
 * of argv (`ps` and shell history expose argv, never a child's own env) —
 * `HOLOCRON_<KEY_IN_SCREAMING_SNAKE_CASE>`, e.g. `otp` → `HOLOCRON_OTP`.
 * Merged into {@link spawnChild}'s `extraEnv` alongside `NO_UPDATE_NOTIFIER`
 * and (for a preview spawn) `DRY_RUN_PREVIEW_ENV_VAR`.
 */
export function secretEnv(entry: CommandEntry, optionAnswers: Record<string, OptionAnswer>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const option of entry.options ?? []) {
		if (!option.secret) continue;
		const value = optionAnswers[option.key];
		if (typeof value !== "string" || value === "") continue;
		out[`HOLOCRON_${option.key.replace(/([A-Z])/g, "_$1").toUpperCase()}`] = value;
	}
	return out;
}
