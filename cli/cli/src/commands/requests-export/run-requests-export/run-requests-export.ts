/**
 * `holocron export requests` — writes the repo's request collections in each `tooling` provider's own format.
 *
 * The repo's `collectionFiles` / `envFiles` stay the one source. For each `tooling` provider the config names (or only
 * `--to`), the command reads those two options from the provider's entry and calls the optional `Tooling.export` with
 * them and an output folder, `<out>/<provider>`; by default `.export` beside the first collection file, which is
 * git-ignored (`resolveExportDir()` refuses a folder that is, or holds, the folder of a source file). A provider with
 * no `export`, or an entry with no `collectionFiles`, is a skipped row. What the conversion could not carry across is
 * listed under the provider's row and does not fail the run. It writes files, so it asks first unless `--dry-run` (the
 * files are converted and listed, nothing is written) or `--yes` (without a terminal it refuses instead).
 */

import { relative } from "node:path";

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
import { assertPluginsResolvable, PluginLoader, type Tooling } from "../../../plugin/index.js";
import { resolveExportDir } from "../resolve-export-dir/index.js";
import type { RequestsExportReport, RunRequestsExportInput } from "./run-requests-export.type.js";

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

/** One provider to export for: its tuple, the files it names and the folder it goes to. */
interface Target {
	provider: string;
	collectionFiles: string[];
	envFiles: string[];
	outDir: string;
}

export async function runRequestsExport(input: RunRequestsExportInput): Promise<RequestsExportReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	const { repoRoot } = input.context;
	const finish = (rows: CheckRow[]): RequestsExportReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: summary.fail > 0 ? "fail" : "ok", rows };
	};
	print(style.header(`Holocron export requests${dryRun ? " (dry-run)" : ""}`));
	print("");

	const entry = input.loaded.resolved.providers.tooling;
	// `tooling` is a many-cardinality capability, so its entry is always a list.
	const tuples: ResolvedTuple[] = entry?.cardinality === "many" ? entry.tuples : [];
	if (tuples.length === 0)
		return finish([row("tooling", "fail", "the config has no `tooling` provider to export for")]);
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
	assertPluginsResolvable(loader, "export requests");
	const loaded = loader.has("tooling") ? (loader.get("tooling") as Tooling[]) : [];

	const rows: CheckRow[] = [];
	const targets: Array<Target & { tool: Tooling & Required<Pick<Tooling, "export">> }> = [];
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
		if (!tool.export) {
			rows.push(row(id, "skip", "has no export: it reads the repo's files as they are"));
			continue;
		}
		const collectionFiles = fileList(tuple.options.collectionFiles);
		const envFiles = fileList(tuple.options.envFiles);
		if (collectionFiles.length === 0) {
			rows.push(row(id, "skip", "names no `collectionFiles`, so there is nothing to export"));
			continue;
		}
		const dir = resolveExportDir({
			repoRoot,
			provider: id,
			files: [...collectionFiles, ...envFiles],
			...(input.out !== undefined ? { out: input.out } : {}),
		});
		if (!dir.ok) {
			rows.push(row(id, "fail", dir.message));
			continue;
		}
		targets.push({
			provider: id,
			collectionFiles,
			envFiles,
			outDir: dir.dir,
			tool: tool as Tooling & Required<Pick<Tooling, "export">>,
		});
	}
	if (targets.length === 0) return finish(rows);

	if (!dryRun && !input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`export requests\` writes files for ${targets.length} provider(s); pass --yes to run it without asking, or --dry-run to preview`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Write the exports for ${targets.map((t) => t.provider).join(", ")}?`
		);
		if (!proceed) {
			print(`  ${style.skip("cancelled; nothing was written")}`);
			return { status: "cancelled", rows: [] };
		}
	}

	for (const { tool, provider, collectionFiles, envFiles, outDir } of targets) {
		try {
			const result = await tool.export({
				collectionFiles,
				envFiles,
				outDir,
				repoRoot,
				...(dryRun ? { dryRun: true } : {}),
			});
			const where = relative(repoRoot, outDir);
			const files = result.files.length > 0 ? ` (${result.files.join(", ")})` : "";
			rows.push(
				row(
					provider,
					"ok",
					`${dryRun ? "would write" : "wrote"} ${result.files.length} file(s) to ${where}${files}`,
					result.issues.map((issue) => `issue in ${issue.file}: ${issue.message}`)
				)
			);
		} catch (err) {
			rows.push(row(provider, "fail", describeError(err)));
		}
	}
	return finish(rows.sort((a, b) => a.id.localeCompare(b.id)));
}
