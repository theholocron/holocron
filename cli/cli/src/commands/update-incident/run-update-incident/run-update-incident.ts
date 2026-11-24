/**
 * `holocron update incident <id>` and `holocron close incident <id>` -- append an update to a status page incident (spec
 * `tech-open-status-page-incidents`, #2591).
 *
 * Only appends: an update is never rewritten or deleted, which `sync incidents` relies on. Before writing, the incident
 * is read, so a retry is safe: an incident whose newest update already has this status and message is left alone, closing
 * a resolved incident does nothing, and an update to a resolved incident is refused (its status must not leave
 * `resolved`). It writes to a live public page, so it asks first (`--yes` skips the question, `--dry-run` writes nothing).
 */

import { confirm } from "@inquirer/prompts";
import { describeError, NonInteractiveError, statusRow } from "@theholocron/kyber/ui";

import { assertPluginsResolvable, PluginLoader } from "../../../plugin/index.js";
import { incidentWriteFailure } from "../../incident-write-failure/index.js";
import { pickStatusPage } from "../../pick-status-page/index.js";
import type { RunUpdateIncidentInput, RunUpdateIncidentReport } from "./run-update-incident.type.js";

/** How far back an incident is looked for: an open one is always read, a resolved one only when it is recent. */
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
/** What a closing update says when `--message` is left out. */
const RESOLVED_MESSAGE = "This incident is resolved.";

export async function runUpdateIncident(input: RunUpdateIncidentInput): Promise<RunUpdateIncidentReport> {
	const name = input.mode === "close" ? "close incident" : "update incident";
	const print = input.print ?? ((line: string) => console.log(line));
	const row = (status: "ok" | "skip" | "fail", ...parts: string[]) => print(statusRow(status, [name, ...parts]));
	const stop = (status: "fail" | "skip", reason: string): RunUpdateIncidentReport => {
		row(status, reason);
		return { status, reason };
	};
	const notify = input.notify ?? true;
	const status = input.mode === "close" ? "resolved" : input.status;
	const message = (input.message ?? (input.mode === "close" ? RESOLVED_MESSAGE : "")).trim();

	if (input.mode === "update") {
		if (!status) return stop("fail", "an update needs --status (investigating, identified or monitoring)");
		if (message === "") return stop("fail", "an update needs --message");
		if (status === ("resolved" as string)) return stop("fail", "use `close incident` to resolve one");
	}

	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, name);

	const monitoring = loader.has("monitoring") ? loader.get("monitoring") : undefined;
	const write = input.mode === "close" ? monitoring?.resolveIncident : monitoring?.updateIncident;
	if (!monitoring || !write) return stop("fail", "no `monitoring` provider that updates status page incidents");
	if (!monitoring.listIncidents)
		return stop("fail", "the `monitoring` provider cannot read incidents, so a retry could not be made safe");
	const picked = pickStatusPage(monitoring.statusPages ?? [], input.page);
	if ("problem" in picked) return stop("fail", picked.problem);
	const { page } = picked;

	let incident;
	try {
		const since = new Date((input.now ?? new Date()).getTime() - LOOKBACK_MS).toISOString();
		incident = (await monitoring.listIncidents({ statusPage: page.name, since })).find((i) => i.id === input.id);
	} catch (err) {
		return stop("fail", `reading the incidents of "${page.name}": ${describeError(err)}`);
	}
	if (!incident) {
		return stop("fail", `no incident ${input.id} on "${page.name}" that is open or resolved in the last 7 days`);
	}

	if (incident.status === "resolved") {
		if (input.mode === "close") return stop("skip", `"${incident.title}" is already resolved`);
		return stop("fail", `"${incident.title}" is resolved; an update must not move it out of resolved`);
	}
	const newest = incident.updates.at(-1);
	if (newest && newest.status === status && newest.text.trim() === message) {
		return stop("skip", `"${incident.title}" already has this update (${newest.id})`);
	}

	const told = notify ? "subscribers will be told" : "subscribers will not be told";
	const what = `${status} update to "${incident.title}" on "${page.name}"`;
	if (input.context.dryRun) {
		row("skip", `would append a ${what}; ${told}`);
		return { status: "ok" };
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`${name}\` writes to a public status page; pass --yes to run it without asking, or --dry-run to look`
			);
		}
		const proceed = await (input.confirm ?? ((q) => confirm({ message: q, default: false })))(
			`Append a ${what}; ${told}?`
		);
		if (!proceed) {
			row("skip", "cancelled; nothing was changed");
			return { status: "cancelled" };
		}
	}

	try {
		const written = await write.call(monitoring, {
			statusPage: page.name,
			id: input.id,
			status: status!,
			message,
			notify,
		});
		row("ok", `appended a ${what}; it is now ${written.status}; ${told}`);
		return { status: "ok" };
	} catch (err) {
		return stop("fail", incidentWriteFailure(`updating "${incident.title}"`, err));
	}
}
