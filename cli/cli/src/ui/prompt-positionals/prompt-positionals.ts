import { input, select } from "@inquirer/prompts";

import { NonInteractiveError } from "../non-interactive-error/index.js";
import type { PositionalCommand } from "./prompt-positionals.type.js";

/**
 * For each of `entry.positionals` not already present in `argv`, prompts for
 * it (`input()` or `select()`, per the positional's `type`) and returns the
 * resolved values in positional order — ready to append to a spawned child's
 * argv, or to use directly in the current handler (Layer 3).
 *
 * Throws {@link NonInteractiveError} the first time it would need to prompt
 * on a non-TTY stdin, and again if a `select` positional's choices resolve
 * empty (nothing to pick from — e.g. `auth unset` with no stored tokens).
 */
export async function promptForPositionals(entry: PositionalCommand, argv: Record<string, unknown>): Promise<string[]> {
	const out: string[] = [];
	for (const positional of entry.positionals) {
		const existing = argv[positional.key];
		if (existing !== undefined && existing !== "") {
			out.push(String(existing));
			continue;
		}
		if (!process.stdin.isTTY) {
			throw new NonInteractiveError(
				`\`${entry.name}\` needs "${positional.key}" — pass it directly: holocron ${entry.name} <${positional.cliArg ?? positional.key}>`
			);
		}
		if (positional.type === "select") {
			const choices =
				typeof positional.choices === "function" ? positional.choices() : (positional.choices ?? []);
			if (choices.length === 0) {
				throw new NonInteractiveError(
					`\`${entry.name}\`: no ${positional.key} to choose from — nothing stored yet`
				);
			}
			out.push(await select({ message: positional.message, choices: choices.map((c) => ({ value: c })) }));
		} else {
			out.push(
				await input({
					message: positional.message,
					...(positional.validate ? { validate: positional.validate } : {}),
				})
			);
		}
	}
	return out;
}
