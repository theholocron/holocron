import { confirm, select } from "@inquirer/prompts";

import type { ProjectPrompt } from "./terminal-prompt.type.js";

/** The prompt backed by `@inquirer/prompts`, interactive only when stdin is a terminal. */
export function terminalPrompt(): ProjectPrompt {
	return {
		interactive: Boolean(process.stdin.isTTY),
		confirm: (message, defaultValue) => confirm({ message, default: defaultValue }),
		select: (message, choices) => select({ message, choices: choices.map((value) => ({ value })) }),
	};
}
