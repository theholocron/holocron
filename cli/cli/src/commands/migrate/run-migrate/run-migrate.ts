/**
 * `holocron migrate` — move issues, a selection or a board's items from one tracker to another.
 *
 * The source's `export` produces tracker-neutral records and the target's `import` makes them, so any pair of
 * providers that have both works (GitHub to Linear and back today). A second run skips what an earlier one made, since
 * each target records the source address. Two trackers never hold exactly the same things, so every run ends by
 * listing what the target could not carry (`notCarried`); a dry run lists it before anything is written.
 * It writes, so it asks first (`--yes` skips the question; without a terminal it refuses instead of hanging).
 */

import { confirm } from "@inquirer/prompts";
import { describeError, NonInteractiveError, statusRow } from "@theholocron/kyber/ui";

import { collectRecords } from "../collect-records/index.js";
import { openSide } from "../open-side/index.js";
import { parseEndpoint } from "../parse-endpoint/index.js";
import { tallyDropped } from "../tally-dropped/index.js";
import type { MigrateReport, RunMigrateInput } from "./run-migrate.type.js";

export async function runMigrate(input: RunMigrateInput): Promise<MigrateReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const stop = (status: "fail" | "skip", reason: string): MigrateReport => {
		print(statusRow(status, ["migrate", reason]));
		return { status, reason };
	};

	const from = parseEndpoint(input.from, "--from");
	const to = parseEndpoint(input.to, "--to");
	if (from.provider === to.provider && JSON.stringify(from.options) === JSON.stringify(to.options)) {
		return stop("fail", "--from and --to are the same; name a different repo, team or provider");
	}

	const project = input.scope.kind === "project";
	const source = await openSide({
		loaded: input.loaded,
		context: input.context,
		endpoint: from,
		capabilities: project ? ["issues", "projects"] : ["issues"],
		makeLoader: input.makeLoader,
	});
	if (!source.ok) return stop("fail", `source: ${source.reason}`);
	const target = await openSide({
		loaded: input.loaded,
		context: input.context,
		endpoint: to,
		capabilities: ["issues"],
		makeLoader: input.makeLoader,
	});
	if (!target.ok) return stop("fail", `target: ${target.reason}`);
	const importer = target.issues;
	if (!importer?.import) return stop("skip", `the \`${target.provider}\` provider cannot import issues`);

	const collected = await collectRecords({
		source,
		scope: input.scope,
		openOnly: input.openOnly,
	});
	if (!collected.ok) return stop(collected.reason.startsWith("the `") ? "skip" : "fail", collected.reason);
	const { records, notes } = collected;
	for (const note of notes) print(statusRow("skip", ["migrate", note]));
	if (records.length === 0) return stop("skip", "nothing to migrate");

	const dryRun = Boolean(input.context.dryRun);
	const milestone = input.milestone ?? (input.scope.kind === "project" ? input.scope.name : undefined);
	const where = `${source.provider} to ${target.provider}`;

	if (!dryRun && !input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`migrate\` creates issues on ${target.provider}; pass --yes to run it without asking`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Create ${records.length} issue(s) on ${target.provider} from ${source.provider}?`
		);
		if (!proceed) {
			print(statusRow("skip", ["migrate", "cancelled; nothing was changed"]));
			return { status: "cancelled" };
		}
	}

	try {
		const results = await importer.import(records, { ...(milestone ? { milestone } : {}), dryRun });
		for (const r of results) {
			const state = !r.created ? "already migrated" : dryRun ? "would create" : "created";
			print(statusRow(r.created ? "ok" : "skip", ["migrate", `${r.source} → ${r.key ?? "(new)"} (${state})`]));
		}
		const created = results.filter((r) => r.created).length;
		print(
			statusRow(dryRun ? "skip" : "ok", [
				"migrate",
				`${where}: ${dryRun ? "dry run, nothing written; would create" : "created"} ${created}, skipped ${results.length - created}`,
			])
		);
		const notCarried = tallyDropped(results);
		if (notCarried.length > 0) {
			print("      not carried across:");
			for (const { what, count } of notCarried) print(`        ${what}: ${count} issue(s)`);
		}
		return { status: "ok", results, notCarried };
	} catch (err) {
		return stop("fail", `${describeError(err)} (a second run continues where this stopped)`);
	}
}
