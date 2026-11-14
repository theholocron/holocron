/**
 * `holocron sync tooling` — runs each `tooling` provider's `sync()` and nothing else.
 *
 * `holocron setup` does this too, but after every other step the config declares (the vault, the deployment domain, DNS),
 * so pushing a collection to a tool needed all of them to be reachable. This loads only the `tooling` providers and the
 * `credentials` provider their tokens may come from, so no other provider is loaded, called or reported. Each provider
 * is one row; a provider that throws is a failing row and the others still run. `--dry-run` names what would be synced
 * and calls no provider. It asks nothing first: like `setup`, it makes the tool match what the repo declares.
 */

import {
	type CheckRow,
	describeError,
	printCheckRows,
	printCheckSummary,
	style,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { assertPluginsResolvable, PluginLoader, type Tooling } from "../../../plugin/index.js";
import type { RunSyncToolingInput, SyncToolingReport } from "./run-sync-tooling.type.js";

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

export async function runSyncTooling(input: RunSyncToolingInput): Promise<SyncToolingReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	const finish = (rows: CheckRow[]): SyncToolingReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: summary.fail > 0 ? "fail" : "ok", rows };
	};
	print(style.header(`Holocron sync tooling${dryRun ? " (dry-run)" : ""}`));
	print("");

	const { tooling, credentials } = input.loaded.resolved.providers;
	if (!tooling) {
		return finish([
			row(
				"tooling",
				"fail",
				"no `tooling` provider: set `providers.tooling` (for example `postman`) in holocron.config"
			),
		]);
	}

	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const loader =
		input.loader ??
		new PluginLoader(
			{ ...input.loaded.resolved, providers: { tooling, ...(credentials ? { credentials } : {}) } },
			input.context
		);
	/* v8 ignore stop */
	await loader.load();
	assertPluginsResolvable(loader, "sync tooling");
	if (!loader.has("tooling")) {
		const failure = loader.loadFailures().find((f) => f.key === "tooling");
		return finish([
			row(
				"tooling",
				"fail",
				`the \`tooling\` provider is not available${failure ? ` (${describeError(failure.error)})` : ""}`
			),
		]);
	}

	const rows: CheckRow[] = [];
	for (const tool of loader.get("tooling") as Tooling[]) {
		if (dryRun) {
			rows.push(row(tool.providerName, "skip", "would sync"));
			continue;
		}
		try {
			await tool.sync();
			rows.push(row(tool.providerName, "ok", "synced"));
		} catch (err) {
			rows.push(row(tool.providerName, "fail", describeError(err)));
		}
	}
	return finish(rows);
}
