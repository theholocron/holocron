import { input, password, select } from "@inquirer/prompts";

import type { ChosenToken } from "./probe-token.type.js";

/**
 * Asks which token a probe that accepts one should check: the configured one, one from an Environment, or one typed in
 * (hidden as it is typed). Only called on a terminal when neither `--token` nor `--environment` was given.
 */
export async function chooseToken(provider: string): Promise<ChosenToken | undefined> {
	const how = await select({
		message: `Which ${provider} token should it check?`,
		choices: [
			{ name: "The one this repo is configured to use", value: "configured" },
			{ name: "One from a vault Environment (a layer such as ci or dev, or a name)", value: "environment" },
			{ name: "Type or paste a token", value: "paste" },
		],
	});
	if (how === "environment") {
		return { environment: (await input({ message: "Environment (layer or name):", default: "ci" })).trim() };
	}
	if (how === "paste") return { token: (await password({ message: `${provider} token:`, mask: "*" })).trim() };
	return undefined;
}
