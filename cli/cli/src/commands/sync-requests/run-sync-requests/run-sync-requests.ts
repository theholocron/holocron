/**
 * `holocron sync requests` — keeps each `tooling` provider's own workspace and the repo's request files in step, both ways.
 *
 * For each `tooling` provider the config names (or only `--to`) that has the optional `Tooling.workspace`, the command
 * reads the provider's `collectionFiles` / `envFiles` options and asks it first, as a dry run, how its files compare:
 * each is `new`, `changed`, `unchanged`, `removed` or `conflict`. The provider owns the folder, the layout and the
 * record of the last sync (Bruno's is `.bruno/` at the repo root), so this command knows no tool's name or path. It
 * decides which side to write from that record; a `conflict` is a pair whose two sides both changed, which fails the
 * provider's row and writes nothing for it unless `--prefer source|workspace` settles it. With `--check` it stops after
 * the comparison and fails when any file is not `unchanged`; with `--dry-run` it prints the same and stops; otherwise
 * it asks first (unless `--yes`; without a terminal it refuses instead) and has the provider write. Nothing is asked
 * when everything is in sync. A provider with no `workspace`, or an entry with no `collectionFiles`, is a skipped row.
 * What the conversion could not carry across is listed under the provider's row and does not fail the run.
 */

import { confirm } from "@inquirer/prompts";
import {
	type CheckRow,
	describeError,
	NonInteractiveError,
	printCheckRows,
	printCheckSummary,
	style,
	summariseChecks,
} from "@theholocron/kyber/ui";

import type { ResolvedTuple } from "../../../config/index.js";
import {
	assertPluginsResolvable,
	PluginLoader,
	type Tooling,
	type ToolingWorkspaceResult,
} from "../../../plugin/index.js";
import type { RunSyncRequestsInput, SyncRequestsReport } from "./run-sync-requests.type.js";

const row = (id: string, status: CheckRow["status"], detail: string, problems: string[] = []): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems,
});

/** A provider option that is a list of file names; anything else reads as none. */
const fileList = (value: unknown): string[] =>
	Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/** `2 new, 1 changed, 4 unchanged`: the states that occur, in a fixed order. */
function tally(result: ToolingWorkspaceResult): string {
	const states = ["new", "changed", "removed", "conflict", "unchanged"] as const;
	return states
		.map((state) => [state, result.files.filter((file) => file.state === state).length] as const)
		.filter(([, count]) => count > 0)
		.map(([state, count]) => `${count} ${state}`)
		.join(", ");
}

/** The files that are not `unchanged`. */
const outOfDate = (result: ToolingWorkspaceResult) => result.files.filter((file) => file.state !== "unchanged");

/** The files of a pair that both sides changed. */
const conflicts = (result: ToolingWorkspaceResult) => result.files.filter((file) => file.state === "conflict");

/** One provider to sync: the tool and the files it names. */
interface Target {
	provider: string;
	tool: Tooling & Required<Pick<Tooling, "workspace">>;
	collectionFiles: string[];
	envFiles: string[];
}

export async function runSyncRequests(input: RunSyncRequestsInput): Promise<SyncRequestsReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	const check = Boolean(input.check);
	const preferred = input.prefer ? { prefer: input.prefer } : {};
	const { repoRoot } = input.context;
	const finish = (rows: CheckRow[]): SyncRequestsReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: summary.fail > 0 ? "fail" : "ok", rows };
	};
	print(style.header(`Holocron sync requests${check ? " (check)" : dryRun ? " (dry-run)" : ""}`));
	print("");

	const entry = input.loaded.resolved.providers.tooling;
	// `tooling` is a many-cardinality capability, so its entry is always a list.
	const tuples: ResolvedTuple[] = entry?.cardinality === "many" ? entry.tuples : [];
	if (tuples.length === 0)
		return finish([row("tooling", "fail", "the config has no `tooling` provider to sync for")]);
	const chosen = input.to === undefined ? tuples : tuples.filter((t) => t.provider === input.to);
	if (chosen.length === 0) {
		return finish([
			row(
				input.to as string,
				"fail",
				`not a \`tooling\` provider of this config (${tuples.map((t) => t.provider).join(", ")})`
			),
		]);
	}

	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const loader =
		input.loader ??
		new PluginLoader(
			{
				...input.loaded.resolved,
				providers: { tooling: { cardinality: "many", tuples: chosen } },
			},
			input.context
		);
	/* v8 ignore stop */
	await loader.load();
	assertPluginsResolvable(loader, "sync requests");
	const loaded = loader.has("tooling") ? (loader.get("tooling") as Tooling[]) : [];

	const rows: CheckRow[] = [];
	const targets: Target[] = [];
	for (const tuple of chosen) {
		const id = tuple.provider;
		const tool = loaded.find((t) => t.providerName === id);
		if (!tool) {
			const failure = loader.loadFailures().find((f) => f.key === "tooling" && f.provider === id);
			rows.push(
				row(id, "fail", `the provider is not available${failure ? ` (${describeError(failure.error)})` : ""}`)
			);
			continue;
		}
		if (!tool.workspace) {
			rows.push(row(id, "skip", "has no workspace of its own to keep in step"));
			continue;
		}
		const collectionFiles = fileList(tuple.options.collectionFiles);
		if (collectionFiles.length === 0) {
			rows.push(row(id, "skip", "names no `collectionFiles`, so there is nothing to sync"));
			continue;
		}
		targets.push({
			provider: id,
			tool: tool as Target["tool"],
			collectionFiles,
			envFiles: fileList(tuple.options.envFiles),
		});
	}
	if (targets.length === 0) return finish(rows);

	// Compare first, writing nothing: what is out of date decides whether anything is asked or written.
	const plans = new Map<string, ToolingWorkspaceResult>();
	for (const { tool, provider, collectionFiles, envFiles } of targets) {
		try {
			plans.set(
				provider,
				await tool.workspace({ collectionFiles, envFiles, repoRoot, dryRun: true, ...preferred })
			);
		} catch (err) {
			rows.push(row(provider, "fail", describeError(err)));
		}
	}
	// A provider with a conflict is written to by no one: its row fails, and the rest go on.
	const writable = (plan: ToolingWorkspaceResult) => conflicts(plan).length === 0;
	const pending = [...plans.values()].reduce((sum, plan) => sum + (writable(plan) ? outOfDate(plan).length : 0), 0);
	const planned = targets.filter((target) => plans.has(target.provider));
	const toWrite = planned.filter((target) => writable(plans.get(target.provider) as ToolingWorkspaceResult));

	const write = !dryRun && !check && pending > 0;
	if (write && !input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`sync requests\` writes ${pending} file(s); pass --yes to run it without asking, or --dry-run to preview`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Write ${pending} file(s) for ${toWrite.map((t) => t.provider).join(", ")}?`
		);
		if (!proceed) {
			print(`  ${style.skip("cancelled; nothing was written")}`);
			return { status: "cancelled", rows: [] };
		}
	}

	const listed: string[] = [];
	for (const { tool, provider, collectionFiles, envFiles } of planned) {
		let result = plans.get(provider) as ToolingWorkspaceResult;
		if (write && writable(result) && outOfDate(result).length > 0) {
			try {
				result = await tool.workspace({ collectionFiles, envFiles, repoRoot, ...preferred });
			} catch (err) {
				rows.push(row(provider, "fail", describeError(err)));
				continue;
			}
		}
		const issues = result.issues.map((issue) => `issue in ${issue.file}: ${issue.message}`);
		const stale = outOfDate(result);
		const clashes = conflicts(result);
		if (clashes.length > 0) {
			const notes = clashes.map((file) => `${file.path}: ${file.note ?? "both sides changed"}`);
			rows.push(
				row(provider, "fail", `${clashes.length} conflict(s), so nothing was written (${tally(result)})`, [
					...notes,
					...issues,
				])
			);
		} else if (check && stale.length > 0) {
			rows.push(
				row(
					provider,
					"fail",
					`${stale.length} file(s) out of date (${tally(result)}); run \`holocron sync requests\``,
					issues
				)
			);
		} else if (stale.length === 0) {
			rows.push(row(provider, "ok", `in sync (${tally(result)})`, issues));
		} else {
			const verb = write ? "wrote" : "would write";
			rows.push(row(provider, "ok", `${verb} ${stale.length} file(s) (${tally(result)})`, issues));
		}
		if (clashes.length === 0) listed.push(...stale.map((file) => `${file.state.padEnd(7)} ${file.path}`));
	}
	const report = finish(rows.sort((a, b) => a.id.localeCompare(b.id)));
	if (listed.length > 0) {
		print("");
		print(write ? "Wrote:" : check ? "Out of date:" : "Would write:");
		for (const line of listed) print(`  ${line}`);
	}
	return report;
}
