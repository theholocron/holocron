/**
 * `holocron sync issues` — one direction of the issue sync between two trackers.
 *
 * It reads the source's issues with `export`, drops the ones that carry an address from another tracker (the loop
 * guard: such an issue is itself a copy, so syncing it back would echo), and hands the rest to the target's `sync`,
 * which creates what is missing and brings up to date what an earlier migrate or sync made. The source is only read.
 * A rate limit stops the run with a `left` count; the next run continues. Every run ends with the same
 * `not carried across` list `migrate` prints. It writes, so it asks first (`--yes` skips the question; without a
 * terminal it refuses instead of hanging).
 */

import { confirm } from "@inquirer/prompts";
import { describeError, NonInteractiveError, statusRow } from "@theholocron/kyber/ui";

import type { SyncResult } from "../../../plugin/index.js";
import { collectRecords } from "../../migrate/collect-records/index.js";
import { describeLimit } from "../../migrate/describe-limit/index.js";
import { openSide } from "../../migrate/open-side/index.js";
import { parseEndpoint } from "../../migrate/parse-endpoint/index.js";
import { tallyDropped } from "../../migrate/tally-dropped/index.js";
import type { RunSyncIssuesInput, SyncCounts, SyncIssuesReport } from "./run-sync-issues.type.js";

export async function runSyncIssues(input: RunSyncIssuesInput): Promise<SyncIssuesReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const row = (status: "ok" | "skip" | "fail", text: string) => print(statusRow(status, ["sync issues", text]));
	const stop = (status: "fail" | "skip", reason: string): SyncIssuesReport => {
		row(status, reason);
		return { status, reason };
	};

	const from = parseEndpoint(input.from, "--from");
	const to = parseEndpoint(input.to, "--to");
	if (from.provider === to.provider && JSON.stringify(from.options) === JSON.stringify(to.options)) {
		return stop("fail", "--from and --to are the same; name a different repo, team or provider");
	}

	const side = {
		loaded: input.loaded,
		context: input.context,
		capabilities: ["issues" as const],
		command: "sync issues",
	};
	const source = await openSide({ ...side, endpoint: from, makeLoader: input.makeLoader });
	if (!source.ok) return stop("fail", `source: ${source.reason}`);
	const target = await openSide({ ...side, endpoint: to, makeLoader: input.makeLoader });
	if (!target.ok) return stop("fail", `target: ${target.reason}`);
	const syncer = target.issues;
	if (!syncer?.sync) return stop("skip", `the \`${target.provider}\` provider cannot be a sync target`);

	const collected = await collectRecords({
		source,
		scope: { kind: "issues", selector: { all: true, ...(input.since ? { since: input.since } : {}) } },
		limit: input.limit,
		order: input.order,
	});
	if (!collected.ok) return stop(collected.reason.startsWith("the `") ? "skip" : "fail", collected.reason);
	const { records } = collected;
	const limited =
		collected.limit === undefined ? undefined : describeLimit(records.length, collected.matched, input.order);
	if (limited) row("skip", limited);
	if (records.length === 0) return stop("skip", "nothing to sync");

	// The loop guard, on the source and before any write: an issue that is itself a copy is not copied back.
	const guarded = records.filter((r) => r.migratedFrom !== undefined);
	const toSync = records.filter((r) => r.migratedFrom === undefined);
	for (const r of guarded) row("skip", `${r.key} is a copy of ${r.migratedFrom}; not synced back`);

	const dryRun = Boolean(input.context.dryRun);
	let results: SyncResult[] = [];

	if (toSync.length > 0) {
		if (!dryRun && !input.yes) {
			const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
			if (!interactive) {
				throw new NonInteractiveError(
					`\`sync issues\` creates and changes issues on ${target.provider}; pass --yes to run it without asking`
				);
			}
			const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
				`Sync ${toSync.length} issue(s) from ${source.provider} to ${target.provider}? Issues an earlier sync made are updated.`
			);
			if (!proceed) {
				row("skip", "cancelled; nothing was changed");
				return { status: "cancelled" };
			}
		}
		try {
			results = await syncer.sync(toSync, { dryRun });
		} catch (err) {
			return stop("fail", `${describeError(err)} (a second run continues where this stopped)`);
		}
	}

	for (const r of results) {
		if (r.created) {
			row("ok", `${r.source} → ${r.key ?? "(new)"} (${dryRun ? "would create" : "created"})`);
		} else if (r.updated) {
			row("ok", `${r.source} → ${r.key} (${dryRun ? "would update" : "updated"}: ${r.changes.join(", ")})`);
		} else {
			row("skip", `${r.source} → ${r.key} (unchanged)`);
		}
	}

	const done = new Set(results.map((r) => r.source));
	const counts: SyncCounts = {
		created: results.filter((r) => r.created).length,
		updated: results.filter((r) => r.updated).length,
		unchanged: results.filter((r) => !r.created && !r.updated).length,
		guarded: guarded.length,
		left: toSync.filter((r) => !done.has(r.key)).length,
	};
	if (counts.left > 0) {
		row("skip", `stopped: ${target.provider} is rate limiting; ${counts.left} issue(s) are left for the next run`);
	}
	row(
		dryRun ? "skip" : "ok",
		`${source.provider} to ${target.provider}: ${dryRun ? "dry run, nothing written; would create" : "created"} ` +
			`${counts.created}, ${dryRun ? "would update" : "updated"} ${counts.updated}, unchanged ${counts.unchanged}, ` +
			`skipped (guard) ${counts.guarded}, left ${counts.left}`
	);
	const notCarried = tallyDropped(results);
	if (notCarried.length > 0) {
		print("      not carried across:");
		for (const { what, count } of notCarried) print(`        ${what}: ${count} issue(s)`);
	}
	return { status: "ok", results, counts, notCarried, ...(limited ? { limited } : {}) };
}
