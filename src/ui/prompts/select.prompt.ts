import { checkbox } from "@inquirer/prompts";
import { type Choice } from "./types";

export async function selectPrompt(
	selected: string[] | null,
	message: string,
	choices: Choice<string>[]
): Promise<string[]> {
	if (selected) {
		return selected;
	}

	return await checkbox({
		message,
		choices,
	});
}
