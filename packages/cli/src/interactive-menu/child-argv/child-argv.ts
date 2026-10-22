import type { OptionAnswer, OptionPrompt, ResolvedOptions } from "../../ui/index.js";
import type { CommandEntry } from "../command-registry/index.js";

/**
 * Whether `option`'s answer must be delivered via env, never argv — true for
 * an explicit `secret: true`, and also for any `type: "password"` option
 * even if `secret` was left unset. `promptOne` (prompt-options.ts) already
 * treats these two as interchangeable triggers for masking the input
 * itself; `buildChildArgv`/`secretEnv` need to agree, or a password-typed
 * option that forgot to also set `secret: true` would mask the keystrokes
 * on screen while still leaking the typed value into the child's argv.
 */
function isSecretOption(option: OptionPrompt): boolean {
	return Boolean(option.secret) || option.type === "password";
}

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

/**
 * `entry.spawnArgs` if set, else `entry.name` split into tokens — resolved
 * positionals, then non-secret option flags, then forwarded flags, appended
 * in that order. `resolved` is whatever {@link promptForOptions} returned —
 * for a `modes`-based command, that's already the picked mode's own options
 * (plus a synthetic entry for its `flag`, if any), so this renders either
 * shape identically with no need to know which kind of command it came from.
 */
export function buildChildArgv(
	entry: CommandEntry,
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

/**
 * Secret option answers, keyed by the env var their handler reads instead
 * of argv (`ps` and shell history expose argv, never a child's own env) —
 * `HOLOCRON_<KEY_IN_SCREAMING_SNAKE_CASE>`, e.g. `otp` → `HOLOCRON_OTP`.
 * Merged into {@link spawnChild}'s `extraEnv` alongside `NO_UPDATE_NOTIFIER`
 * and (for a preview spawn) `DRY_RUN_PREVIEW_ENV_VAR`.
 */
export function secretEnv(resolved: ResolvedOptions): Record<string, string> {
	const out: Record<string, string> = {};
	for (const option of resolved.options) {
		if (!isSecretOption(option)) continue;
		const value = resolved.answers[option.key];
		if (typeof value !== "string" || value === "") continue;
		out[`HOLOCRON_${option.key.replace(/([A-Z])/g, "_$1").toUpperCase()}`] = value;
	}
	return out;
}
