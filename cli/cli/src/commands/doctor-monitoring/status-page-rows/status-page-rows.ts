import type { CheckRow } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import type { Monitoring, MonitoringStatusPageInput, MonitoringStatusPageState } from "../../../plugin/index.js";
import { missingTokenReason } from "../../missing-token/index.js";

const title = (name: string) => `status page ${name} matches`;

/** What is wrong with a status page, one line each; a record still to make is a `todo:`, which fails the run. */
function problemsOf(input: MonitoringStatusPageInput, state: MonitoringStatusPageState): string[] {
	const problems: string[] = [];
	// Only a privacy the config states is compared: a page that says nothing keeps what it has.
	if (input.private === true && state.public) problems.push("declared private but the page is public");
	if (input.private === false && state.public === false) problems.push("declared public but the page is private");
	problems.push(...state.missingComponents.map((n) => `component ${n} is missing`));
	problems.push(...state.misplacedComponents.map((n) => `component ${n}`));
	problems.push(
		...state.missingRules.map((n) => `rule for ${n} is missing or does not tie its tags and a full outage to it`)
	);
	problems.push(...state.domainProblems);
	if (state.domainVerified === false) {
		const r = state.domainRecord;
		problems.push(
			r
				? `todo: make ${r.type} ${r.name} -> ${r.value}, then run \`holocron setup\` or recheck the domain`
				: `todo: ${input.domain} is not verified and the provider names no record yet`
		);
	}
	return problems;
}

/**
 * One row per declared status page: it exists, its privacy is what is declared, its components and rules are as
 * declared and its custom domain is verified. What the page holds beyond the config is a skipped `info` row.
 * Read-only. A provider with no `inspectStatusPage`, or no token, is a skip with the reason.
 */
export async function statusPageRows(monitoring: Monitoring): Promise<CheckRow[]> {
	const rows: CheckRow[] = [];
	for (const page of monitoring.statusPages ?? []) {
		const id = `monitoring-status-page:${page.name}`;
		if (!monitoring.inspectStatusPage) {
			rows.push({
				id,
				title: title(page.name),
				status: "skip",
				detail: "provider does not implement inspectStatusPage",
				problems: [],
			});
			continue;
		}
		try {
			const state = await monitoring.inspectStatusPage(page);
			if (!state.exists) {
				rows.push({
					id,
					title: title(page.name),
					status: "fail",
					detail: "does not exist; run `holocron setup`",
					problems: [],
				});
				continue;
			}
			const problems = problemsOf(page, state);
			rows.push(
				problems.length > 0
					? { id, title: title(page.name), status: "fail", detail: `${problems.length} problem(s)`, problems }
					: {
							id,
							title: title(page.name),
							status: "ok",
							detail: `${state.public ? "public" : "private"}, ${page.components.length} component(s)${
								state.domainVerified ? ", domain verified" : ""
							}`,
							problems: [],
						}
			);
			if (page.automation === false) {
				rows.push({
					id: `${id}:automation`,
					title: `status page ${page.name} automation`,
					status: "skip",
					detail: "off: no rule ties a failing check to a component, so incidents are opened by hand",
					problems: [],
				});
			}
			const extras = [
				...state.extraComponents.map((n) => `component ${n}`),
				...state.extraRules.map((n) => `rule ${n}`),
			];
			if (extras.length > 0) {
				rows.push({
					id: `${id}:extra`,
					title: `status page ${page.name} has more than the config`,
					status: "skip",
					detail: extras.join(", "),
					problems: [],
				});
			}
		} catch (err) {
			const noToken = missingTokenReason(err);
			rows.push(
				noToken !== undefined
					? { id, title: title(page.name), status: "skip", detail: noToken, problems: [] }
					: { id, title: title(page.name), status: "fail", detail: errorMessage(err), problems: [] }
			);
		}
	}
	return rows;
}
