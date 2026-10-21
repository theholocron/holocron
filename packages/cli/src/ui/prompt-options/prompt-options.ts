import { checkbox, confirm, input, password, select } from "@inquirer/prompts";

import { NonInteractiveError } from "../non-interactive-error/index.js";
import type { OptionAnswer, OptionPrompt, OptionsCommand } from "./prompt-options.type.js";

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
 * For each of `entry.options` not already present in `argv`, resolves a
 * value — `required` ones are always prompted, like required positionals,
 * never behind a selector; everything else is offered through one
 * `checkbox()` ("set any options?") and only the picked ones are then
 * prompted in `entry.options`' own declaration order. An empty `options`
 * list (or every optional one left unpicked) means zero prompts.
 *
 * `when`, evaluated against answers collected so far in that same
 * declaration order, can skip a picked option entirely — e.g. `package
 * publish`'s `--initial` only makes sense once `--sync-trust` (declared
 * first) wasn't chosen. Skipped this way, the option is simply absent from
 * the result, exactly as if it had never been picked.
 *
 * Throws {@link NonInteractiveError} on a non-TTY stdin the first time a
 * prompt would be needed — mirrors `promptForPositionals`.
 */
export async function promptForOptions(
	entry: OptionsCommand,
	argv: Record<string, unknown>
): Promise<Record<string, OptionAnswer>> {
	const options = entry.options ?? [];
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
			`\`${entry.name}\` has options only settable interactively — pass them directly: holocron ${entry.name} [options]`
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
