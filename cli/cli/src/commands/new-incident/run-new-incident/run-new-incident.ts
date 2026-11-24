/**
 * `holocron new incident <title>` -- open an incident on a status page (spec `tech-open-status-page-incidents`, #2591).
 *
 * The page and its components come from the `monitoring` provider's declaration, the incident is written through its
 * `openIncident`, and `sync incidents` then mirrors it to Discord. It writes to a live public page, so it refuses an open
 * incident of the same title (`--allow-duplicate` overrides), asks first (`--yes` skips the question, `--dry-run` writes
 * nothing) and says whether subscribers will be told. Every problem with the request is found before anything is written.
 */

import { confirm } from "@inquirer/prompts";
import { describeError, NonInteractiveError, statusRow } from "@theholocron/kyber/ui";

import { assertPluginsResolvable, type MonitoringIncidentStatus, PluginLoader } from "../../../plugin/index.js";
import { incidentMirrorNote } from "../../incident-mirror-note/index.js";
import { incidentTitleKey } from "../../incident-title-key/index.js";
import { incidentWriteFailure } from "../../incident-write-failure/index.js";
import { parseIncidentImpacts } from "../../parse-incident-impacts/index.js";
import { pickStatusPage } from "../../pick-status-page/index.js";
import type { RunNewIncidentInput, RunNewIncidentReport } from "./run-new-incident.type.js";

/** What the opening update says when `--message` is left out. */
const DEFAULT_MESSAGES: Record<Exclude<MonitoringIncidentStatus, "resolved">, string> = {
	investigating: "We are investigating.",
	identified: "We have identified the cause and are working on it.",
	monitoring: "A fix is in place and we are monitoring.",
};

export async function runNewIncident(input: RunNewIncidentInput): Promise<RunNewIncidentReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const row = (status: "ok" | "skip" | "fail", ...parts: string[]) =>
		print(statusRow(status, ["new incident", ...parts]));
	const stop = (status: "fail" | "skip", reason: string): RunNewIncidentReport => {
		row(status, reason);
		return { status, reason };
	};
	const title = input.title.trim();
	const status = input.status ?? "investigating";
	const notify = input.notify ?? true;

	if (title === "") return stop("fail", "the incident needs a title");
	if (!(status in DEFAULT_MESSAGES)) {
		return stop("fail", `an incident opens as investigating, identified or monitoring, not "${status}"`);
	}

	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "new incident");

	const monitoring = loader.has("monitoring") ? loader.get("monitoring") : undefined;
	if (!monitoring?.openIncident) return stop("fail", "no `monitoring` provider that opens status page incidents");
	const pages = monitoring.statusPages ?? [];
	const picked = pickStatusPage(pages, input.page);
	if ("problem" in picked) return stop("fail", picked.problem);
	const { page } = picked;

	const { impacts, problems } = parseIncidentImpacts(
		input.components ?? [],
		page.components.map((c) => c.name)
	);
	if (problems.length > 0) {
		for (const problem of problems) row("fail", problem);
		return { status: "fail", reason: problems.join("; ") };
	}

	// An open incident of the same title means a rerun, not a second outage.
	if (monitoring.listIncidents && !input.allowDuplicate) {
		try {
			const key = incidentTitleKey(title);
			const open = (await monitoring.listIncidents({ statusPage: page.name })).find(
				(i) => i.status !== "resolved" && incidentTitleKey(i.title) === key
			);
			if (open) {
				return stop(
					"fail",
					`"${open.title}" is already open on "${page.name}" (${open.id}); --allow-duplicate opens another`
				);
			}
		} catch (err) {
			return stop("fail", `reading the open incidents of "${page.name}": ${describeError(err)}`);
		}
	} else if (!monitoring.listIncidents) {
		row("skip", "the provider cannot list incidents, so an open one of the same title was not looked for");
	}

	const message = input.message ?? DEFAULT_MESSAGES[status];
	const marked = impacts.map((i) => `${i.component} ${i.impact}`).join(", ") || "no component";
	const told = notify ? "subscribers will be told" : "subscribers will not be told";
	// With no `notifications` provider loaded (a workflow holds no bot token) there is nothing to say about the mirror.
	const note = loader.has("notifications")
		? incidentMirrorNote(loader.get("notifications"), page.name, pages.length)
		: undefined;

	if (input.context.dryRun) {
		row("skip", `would open "${title}" on "${page.name}" as ${status} (${marked}); ${told}`);
		if (note) row("skip", note);
		return { status: "ok" };
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				"`new incident` writes to a public status page; pass --yes to run it without asking, or --dry-run to look"
			);
		}
		const proceed = await (input.confirm ?? ((q) => confirm({ message: q, default: false })))(
			`Open "${title}" on "${page.name}" as ${status} (${marked}); ${told}?`
		);
		if (!proceed) {
			row("skip", "cancelled; nothing was changed");
			return { status: "cancelled" };
		}
	}

	try {
		const written = await monitoring.openIncident({
			statusPage: page.name,
			title,
			status,
			message,
			notify,
			impacts,
		});
		row("ok", `opened "${title}" on "${page.name}" as ${written.status} (${written.id}); ${told}`);
		if (note) row("skip", note);
		return { status: "ok", id: written.id };
	} catch (err) {
		return stop("fail", incidentWriteFailure(`opening "${title}"`, err));
	}
}
