import { select } from "@inquirer/prompts";

import type { IssueEffort } from "../../../plugin/index.js";

/** Asks which Effort the work is; `undefined` when the person leaves it unset. */
export async function promptEffort(): Promise<IssueEffort | undefined> {
	const answer = await select<IssueEffort | "none">({
		message: "Effort:",
		choices: [
			{ name: "high", value: "high" },
			{ name: "medium", value: "medium" },
			{ name: "low", value: "low" },
			{ name: "leave it unset", value: "none" },
		],
	});
	return answer === "none" ? undefined : answer;
}
