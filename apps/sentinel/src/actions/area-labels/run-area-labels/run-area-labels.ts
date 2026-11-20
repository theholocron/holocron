import { errorMessage } from "@theholocron/misc-utils";

import { planAreaLabels } from "../plan-area-labels/index.js";
import { readAreaConfig } from "../read-area-config/index.js";
import type { RunAreaLabelsInput, RunAreaLabelsResult } from "./run-area-labels.type.js";

/**
 * The area labels for one pull request or issue (spec `tech-github-area-labels`, rollout item 3): reads the declared
 * areas from the repository's own config, the item, a pull request's changed files and the repository's labels from
 * the API (never the webhook payload), plans with `planAreaLabels()` and adds what it names in one call. Add-only: it
 * never removes a label, and a label the repository lacks is reported, not made. Quietly `skipped` when the repo
 * declares no `repo.labels.areas` or the item is closed; when the plan adds nothing no write is made, so a
 * redelivery changes nothing. Never throws.
 */
export async function runAreaLabels(input: RunAreaLabelsInput): Promise<RunAreaLabelsResult> {
	const { client, repo, trigger } = input;
	try {
		const config = await (input.readConfig ?? readAreaConfig)({ client, repo });
		if (!config.ok) return { status: "skipped", reason: config.reason };

		const item = await client.issues.getIssue(repo, trigger.number);
		if (item.state !== "open") return { status: "skipped", reason: `#${trigger.number} is ${item.state}` };

		const files =
			trigger.kind === "pull_request"
				? (await client.pulls.listFiles(repo, trigger.number)).flatMap((f) =>
						f.previous_filename ? [f.filename, f.previous_filename] : [f.filename]
					)
				: undefined;
		const repoLabels = (await client.labels.listLabels(repo)).map((l) => l.name);
		const plan = planAreaLabels({
			areas: config.areas,
			scopes: config.scopes,
			files,
			title: item.title,
			existing: item.labels.map((l) => l.name),
			repoLabels,
		});
		if (plan.add.length > 0) await client.issues.addLabels(repo, trigger.number, plan.add);
		return { status: "ok", added: plan.add, missing: plan.missing, dropped: plan.dropped };
	} catch (err) {
		return { status: "fail", reason: errorMessage(err) };
	}
}
