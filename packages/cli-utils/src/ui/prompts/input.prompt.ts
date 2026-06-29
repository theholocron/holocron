import { input } from "@inquirer/prompts";
import { validate } from "./utils";

export async function inputPrompt(message: string, isRequired?: boolean = false, options): Promise<string> {
	const opts = {
		message,
		...options,
	};

	if (isRequired) {
		opts.validate = validate.isNotEmpty;
	}

	return await input(opts);
}
