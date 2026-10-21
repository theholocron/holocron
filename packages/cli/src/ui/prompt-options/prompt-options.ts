import { checkbox, confirm, input, password, select } from "@inquirer/prompts";

import { NonInteractiveError } from "../non-interactive-error/index.js";
import type { OptionAnswer, OptionMode, OptionPrompt, OptionsCommand, ResolvedOptions } from "./prompt-options.type.js";

async function promptOne(option: OptionPrompt): Promise<OptionAnswer> {
	if (option.secret || option.type === "password") {
		return await password({ message: option.message });
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
			values.push(await input({ message: `${option.message} (${n + 1} of ${option.arity})` }));
		}
		return values;
	}
	return await input({ message: option.message, default: option.default as string | undefined });
}

/**
 * For each of `options` not already present in `argv`, resolves a value —
 * `required` ones are always prompted, like required positionals, never
 * behind a selector; everything else is offered through one `checkbox()`
 * ("set any options?") and only the picked ones are then prompted in
 * `options`' own declaration order. An empty list (or every optional one
 * left unpicked) means zero prompts.
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
): Promise<Record<string, OptionAnswer>> {
	if (options.length === 0) return {};

	const answers: Record<string, OptionAnswer> = {};
	const needsPrompt = (option: OptionPrompt): boolean => {
		const existing = argv[option.key];
		return existing === undefined || existing === "";
	};

	const required = options.filter((o) => o.required);
	const optional = options.filter((o) => !o.required);

	if ((required.length > 0 || optional.some(needsPrompt)) && !process.stdin.isTTY) {
		throw new NonInteractiveError(
			`\`${commandName}\` has options only settable interactively — pass them directly: holocron ${commandName} [options]`
		);
	}

	for (const option of required) {
		if (!needsPrompt(option)) {
			answers[option.key] = argv[option.key] as OptionAnswer;
			continue;
		}
		answers[option.key] = await promptOne(option);
	}

	const selectable = optional.filter(needsPrompt);
	if (selectable.length === 0) return answers;

	const picked = await checkbox({
		message: "Set any options? (space to select, enter to skip)",
		choices: selectable.map((o) => ({ name: o.message, value: o.key })),
	});
	if (picked.length === 0) return answers;

	const pickedSet = new Set(picked);
	for (const option of optional) {
		if (!pickedSet.has(option.key)) continue;
		if (option.when && !option.when(answers)) continue;
		answers[option.key] = await promptOne(option);
	}
	return answers;
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
	const answers = await promptForFlatOptions(entry.name, options, argv);
	if (!mode.flag) return { options, answers };

	const flagOption: OptionPrompt = {
		key: `__mode_${mode.key}`,
		flag: mode.flag,
		type: "confirm",
		message: mode.message,
	};
	return { options: [flagOption, ...options], answers: { [flagOption.key]: true, ...answers } };
}

/**
 * Resolves `entry`'s options into a {@link ResolvedOptions} ready for
 * `buildChildArgv`/`secretEnv` — delegating to {@link promptForModes} when
 * `entry.modes` is set, or treating `entry.options` as a flat list
 * otherwise. See `promptForFlatOptions` for the flat-list prompting
 * algorithm itself.
 */
export async function promptForOptions(entry: OptionsCommand, argv: Record<string, unknown>): Promise<ResolvedOptions> {
	if (entry.modes && entry.modes.length > 0) {
		return promptForModes(entry, entry.modes, argv);
	}
	const options = entry.options ?? [];
	const answers = await promptForFlatOptions(entry.name, options, argv);
	return { options, answers };
}
