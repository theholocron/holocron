import type { ProbeContext } from "@theholocron/cli";

import type { BackfillItem, BackfillOptions } from "./issue-types.type.js";

/** What a run counted and found, for the closing report. */
export interface Tally {
	examined: number;
	pullRequestsSkipped: number;
	/** The Type set (or, on a dry run, to be set), by Type name. */
	typeSet: Record<string, number>;
	typed: number;
	noKind: number;
	/** Issues with two or more kind labels, left for a person. */
	ambiguous: Array<{ number: number; labels: string[] }>;
	areaLabelsAdded: number;
	/** Area labels the plan wanted that the repository does not have. */
	missingAreaLabels: Set<string>;
	milestoneSet: { parent: number; explicit: number };
	projectSet: number;
	/** The issues still without each of the four, once the planned changes are made. */
	lacking: Record<"project" | "milestone" | "priority" | "effort", BackfillItem[]>;
	failed: number;
	/** The number of the last issue the run finished, the cursor. */
	last: number | undefined;
	/** Why the organization's issue fields could not be listed, when they could not. */
	skippedFields: string | undefined;
}

/** What `reportBackfill` is told besides the tally. */
export interface ReportInput {
	tally: Tally;
	options: BackfillOptions;
	dryRun: boolean;
	/** The window has issues the run did not reach. */
	more: boolean;
	/** The run stopped because GitHub asked it to. */
	rateLimited: boolean;
	/** The issue fields (`priority`, `effort`) the lacking lists cover. */
	fields: string[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const GROUPS = [
	["project", "a project"],
	["milestone", "a milestone"],
	["priority", "a Priority"],
	["effort", "an Effort"],
] as const;

/** The command the maintainer runs to continue, from the cursor. */
function resumeCommand(options: BackfillOptions, cursor: number): string {
	const flags = ["--after", String(cursor)];
	if (options.issues) flags.push("--issues", options.issues.join(","));
	if (options.since) flags.push("--since", options.since);
	flags.push("--limit", String(options.limit));
	if (options.milestone) flags.push("--milestone", options.milestone);
	if (options.project) flags.push("--project", options.project);
	if (options.pullRequests) flags.push("--pull-requests");
	return `holocron probe github issue-types -- ${flags.join(" ")}`;
}

/** Prints the counts, what was left for a person, the lists of what is still missing and how to go on. */
export function reportBackfill(ctx: ProbeContext, input: ReportInput): void {
	const { tally, options, dryRun, more, rateLimited, fields } = input;
	const verb = dryRun ? "would be set" : "set";

	ctx.say({ status: "heading", label: "Backfill" });
	ctx.say({
		status: "info",
		label: "read",
		detail:
			`${plural(tally.examined, "item")} finished` +
			(tally.pullRequestsSkipped > 0
				? `, ${plural(tally.pullRequestsSkipped, "pull request")} passed over`
				: "") +
			(tally.failed > 0 ? `, ${plural(tally.failed, "failure")}` : ""),
	});
	const types = Object.entries(tally.typeSet)
		.map(([name, n]) => `${name} ${n}`)
		.join(", ");
	ctx.say({
		status: "info",
		label: "Type",
		detail: `${types || "none"} ${verb}; ${tally.typed} already typed, ${tally.noKind} with no kind label, ${tally.ambiguous.length} with two kind labels`,
	});
	for (const a of tally.ambiguous) {
		ctx.say({
			status: "info",
			label: `#${a.number}`,
			detail: `has ${a.labels.join(" and ")}: left for a person to choose`,
		});
	}
	ctx.say({ status: "info", label: "area labels", detail: `added to ${plural(tally.areaLabelsAdded, "item")}` });
	for (const label of tally.missingAreaLabels) {
		ctx.say({
			status: "info",
			label,
			detail: "wanted but the repository has no such label: run `holocron setup` first",
		});
	}
	ctx.say({
		status: "info",
		label: "milestone",
		detail: `${verb} on ${tally.milestoneSet.parent + tally.milestoneSet.explicit} (${tally.milestoneSet.parent} from a parent, ${tally.milestoneSet.explicit} from --milestone)`,
	});
	ctx.say({
		status: "info",
		label: "project",
		detail: `${plural(tally.projectSet, "issue")} ${dryRun ? "would be added" : "added"} from --project`,
	});

	ctx.say({
		status: "heading",
		label: `Still lacking, among the ${plural(tally.examined, "item")} read${dryRun ? ", after the changes above" : ""}`,
	});
	if (tally.skippedFields !== undefined) {
		ctx.say({
			status: "info",
			label: "Priority, Effort",
			detail: `not listed: the issue fields could not be read (${tally.skippedFields})`,
		});
	}
	for (const [group, noun] of GROUPS) {
		const listed = group === "project" || group === "milestone" || fields.includes(group);
		if (!listed) continue;
		const items = tally.lacking[group];
		ctx.say({ status: items.length === 0 ? "ok" : "info", label: `without ${noun}`, detail: String(items.length) });
		for (const item of items) {
			ctx.say({ status: "info", label: `#${item.number}`, detail: `${item.state}: ${item.title}` });
		}
	}

	if (more && tally.last !== undefined) {
		ctx.say({
			status: "info",
			label: "resume",
			detail: `${rateLimited ? "GitHub's rate limit stopped the run" : "the limit was reached"}; to continue: ${resumeCommand(options, tally.last)}`,
		});
	} else if (more) {
		ctx.say({
			status: "info",
			label: "resume",
			detail: "GitHub's rate limit stopped the run before it finished one item; run it again later",
		});
	} else {
		ctx.say({ status: "info", label: "resume", detail: "the window is finished" });
	}
}
