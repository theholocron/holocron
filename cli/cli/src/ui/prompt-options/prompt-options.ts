import { checkbox, confirm, input, password, select } from "@inquirer/prompts";

import { NonInteractiveError } from "../non-interactive-error/index.js";
import type { OptionAnswer, OptionMode, OptionPrompt, OptionsCommand, ResolvedOptions } from "./prompt-options.type.js";

/**
 * A required option must not resolve to an empty answer — `optionArgv`/
 * `secretEnv` (child-argv.ts) both drop an empty-string value entirely,
 * which would silently invoke the child without a flag the caller asked
 * for. Passed as `validate` so inquirer re-prompts instead of accepting it.
 */
const requireNonEmpty = (value: string): boolean | string => value.trim().length > 0 || "required";

async function promptOne(option: OptionPrompt): Promise<OptionAnswer> {
	if (option.secret || option.type === "password") {
		return await password({ message: option.message, ...(option.required ? { validate: requireNonEmpty } : {}) });
	}
	if (option.type === "confirm") {
		return await confirm({ message: option.message, default: option.default as boolean | undefined });
	}
	if (option.type === "select") {
		const choices = typeof option.choices === "function" ? option.choices() : (option.choices ?? []);
		return await select({ message: option.message, choices: choices.map((c) => ({ value: c })) });
	}
	if (option.arity && option.arity > 1) {
		const values: string[] = [];
		for (let n = 0; n < option.arity; n++) {
			values.push(
				await input({
					message: `${option.message} (${n + 1} of ${option.arity})`,
					...(option.required ? { validate: requireNonEmpty } : {}),
				})
			);
		}
		return values;
	}
	return await input({
		message: option.message,
		default: option.default as string | undefined,
		...(option.required ? { validate: requireNonEmpty } : {}),
	});
}

interface FlatResult {
	answers: Record<string, OptionAnswer>;
	/** Picked options with `askLast: true` -- their value isn't collected here; see `promptForDeferredOptions`. */
	deferred: OptionPrompt[];
}

/**
 * For each of `options` not already present in `argv`, resolves a value —
 * `required` ones are always included, like required positionals, never
 * behind a selector; everything else is offered through one `checkbox()`
 * ("set any options?") and only the picked ones are then prompted in
 * `options`' own declaration order. An empty list (or every optional one
 * left unpicked) means zero prompts.
 *
 * A picked option (whether required or checkbox-picked) with
 * `askLast: true` (holocron#1052 follow-up — a time-sensitive secret like
 * an OTP, which should be typed as close as possible to when it's actually
 * used, or one that's always needed for a specific operator's own account
 * but not everyone's) isn't given a value here yet: it's returned in
 * `deferred` instead, for the caller to resolve via
 * `promptForDeferredOptions` right before the real (non-dry-run) spawn.
 *
 * `when`, evaluated against answers collected so far in that same
 * declaration order, can skip a picked option entirely. Skipped this way,
 * the option is simply absent from the result, exactly as if it had never
 * been picked — acceptable for a minor, genuinely optional dependency, but
 * prefer `OptionMode` (see `promptForOptions`) when the options have a
 * real either/or relationship, so nothing contingent is shown at all.
 */
async function promptForFlatOptions(
	commandName: string,
	options: OptionPrompt[],
	argv: Record<string, unknown>
): Promise<FlatResult> {
	if (options.length === 0) return { answers: {}, deferred: [] };

	const answers: Record<string, OptionAnswer> = {};
	const deferred: OptionPrompt[] = [];
	const needsPrompt = (option: OptionPrompt): boolean => {
		const existing = argv[option.key];
		return existing === undefined || existing === "";
	};

	const required = options.filter((o) => o.required);
	const optional = options.filter((o) => !o.required);

	if ((required.some(needsPrompt) || optional.some(needsPrompt)) && !process.stdin.isTTY) {
		throw new NonInteractiveError(
			`\`${commandName}\` has options only settable interactively — pass them directly: holocron ${commandName} [options]`
		);
	}

	for (const option of required) {
		if (!needsPrompt(option)) {
			answers[option.key] = argv[option.key] as OptionAnswer;
			continue;
		}
		// required and askLast combine cleanly: required only decides
		// whether this option sits behind the checkbox (never, here) --
		// askLast still decides WHEN its value is collected (holocron#1052
		// follow-up: --otp, required: true for an operator whose own npm
		// account enforces 2FA, every run -- still deferred to right
		// before the real spawn).
		if (option.askLast) {
			deferred.push(option);
			continue;
		}
		answers[option.key] = await promptOne(option);
	}

	// An optional option already supplied in argv is never re-prompted, but
	// its value still needs to land in `answers` -- otherwise a `when`
	// predicate checking for it sees it as missing, and buildChildArgv drops
	// the flag the caller explicitly passed, silently.
	for (const option of optional) {
		if (!needsPrompt(option)) answers[option.key] = argv[option.key] as OptionAnswer;
	}

	const selectable = optional.filter(needsPrompt);
	if (selectable.length === 0) return { answers, deferred };

	const picked = await checkbox({
		message: "Set any options? (space to select, enter to skip)",
		choices: selectable.map((o) => ({ name: o.message, value: o.key })),
	});
	if (picked.length === 0) return { answers, deferred };

	const pickedSet = new Set(picked);
	for (const option of optional) {
		if (!pickedSet.has(option.key)) continue;
		if (option.when && !option.when(answers)) continue;
		if (option.askLast) {
			deferred.push(option);
			continue;
		}
		answers[option.key] = await promptOne(option);
	}
	return { answers, deferred };
}

/**
 * For a `modes`-based command (holocron#1052 follow-up): asks which
 * mutually exclusive workflow first ("What would you like to do?"), then
 * offers only that mode's own options, via the exact same
 * `promptForFlatOptions` flow. The picked mode's `flag`, if it has one, is
 * folded in as an already-resolved `confirm`-type option so
 * `buildChildArgv` renders it with no special-casing — it just sees
 * another boolean option whose answer happens to already be `true`.
 */
async function promptForModes(
	entry: OptionsCommand,
	modes: OptionMode[],
	argv: Record<string, unknown>
): Promise<ResolvedOptions> {
	if (!process.stdin.isTTY) {
		throw new NonInteractiveError(
			`\`${entry.name}\` has options only settable interactively — pass them directly: holocron ${entry.name} [options]`
		);
	}
	const modeKey = await select({
		message: "What would you like to do?",
		choices: modes.map((m) => ({ name: m.message, value: m.key, description: m.description })),
	});
	// `modeKey` is drawn from `modes` itself, so this is always defined.
	const mode = modes.find((m) => m.key === modeKey)!;
	const options = mode.options ?? [];
	const { answers, deferred } = await promptForFlatOptions(entry.name, options, argv);
	if (!mode.flag) return { options, answers, deferred };

	const flagOption: OptionPrompt = {
		key: `__mode_${mode.key}`,
		flag: mode.flag,
		type: "confirm",
		message: mode.message,
	};
	return { options: [flagOption, ...options], answers: { [flagOption.key]: true, ...answers }, deferred };
}

/**
 * Resolves `entry`'s options into a {@link ResolvedOptions} ready for
 * `buildChildArgv`/`secretEnv` — delegating to {@link promptForModes} when
 * `entry.modes` is set, or treating `entry.options` as a flat list
 * otherwise. See `promptForFlatOptions` for the flat-list prompting
 * algorithm itself. `result.deferred` still needs
 * {@link promptForDeferredOptions} before the real spawn.
 */
export async function promptForOptions(entry: OptionsCommand, argv: Record<string, unknown>): Promise<ResolvedOptions> {
	if (entry.modes && entry.modes.length > 0) {
		return promptForModes(entry, entry.modes, argv);
	}
	const options = entry.options ?? [];
	const { answers, deferred } = await promptForFlatOptions(entry.name, options, argv);
	return { options, answers, deferred };
}

/**
 * Collects a value for each of `deferred` — the `askLast: true` options
 * `promptForOptions` deliberately left unresolved. Call this as the very
 * last thing before the real (non-dry-run) spawn, never before: a dry-run
 * preview never reaches the real npm call these options exist for (an OTP
 * is never checked during `--dry-run`), and a time-sensitive code typed
 * any earlier — before a dry-run preview runs, before "proceed with the
 * real run?" waits on a human — risks going stale before it's actually
 * used. A no-op (no prompt at all) when `deferred` is empty.
 */
export async function promptForDeferredOptions(deferred: OptionPrompt[]): Promise<Record<string, OptionAnswer>> {
	const answers: Record<string, OptionAnswer> = {};
	for (const option of deferred) {
		answers[option.key] = await promptOne(option);
	}
	return answers;
}
