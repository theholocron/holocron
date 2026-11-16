/**
 * `holocron upload coverage` — uploads the repo's coverage reports through the `coverage` provider.
 *
 * `--uploads` is a JSON list of `{ flag, files }` (a glob relative to the repo root, or a list of them). The provider's
 * optional `Coverage.upload` does the work (for Codecov: the job's OIDC token, the Codecov CLI, the `SF:` rewrite, the
 * retries) and answers with names and counts; this command prints one row per flag and fails when a flag failed or,
 * without `--allow-empty`, when no group had a report. It never prints a token. `--dry-run` lists the groups and
 * uploads nothing (and loads no provider).
 */

import {
	type CheckRow,
	describeError,
	printCheckRows,
	printCheckSummary,
	style,
	summariseChecks,
} from "@theholocron/kyber/ui";

import { assertPluginsResolvable, type Coverage, PluginLoader } from "../../../plugin/index.js";
import { parseUploads } from "../parse-uploads/index.js";
import type { RunUploadCoverageInput, UploadCoverageReport } from "./run-upload-coverage.type.js";

const row = (id: string, status: CheckRow["status"], detail: string, problems: string[] = []): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems,
});

export async function runUploadCoverage(input: RunUploadCoverageInput): Promise<UploadCoverageReport> {
	/* v8 ignore next -- the console is only used outside tests, which inject `print` */
	const print = input.print ?? ((line: string) => console.log(line));
	const dryRun = Boolean(input.context.dryRun);
	const finish = (rows: CheckRow[], uploaded = 0): UploadCoverageReport => {
		printCheckRows(rows, print);
		const summary = summariseChecks(rows);
		printCheckSummary(summary, print);
		return { status: summary.fail > 0 ? "fail" : "ok", rows, uploaded };
	};
	print(style.header(`Holocron upload coverage${dryRun ? " (dry-run)" : ""}`));
	print("");

	const parsed = parseUploads(input.uploads);
	if (!parsed.ok) return finish([row("uploads", "fail", parsed.message)]);
	if (dryRun) {
		return finish(
			parsed.uploads.map((group) =>
				row(group.flag, "skip", `would upload files matching ${group.files.join(", ")}`)
			)
		);
	}

	const entry = input.loaded.resolved.providers.coverage;
	if (!entry) {
		return finish([
			row(
				"coverage",
				"fail",
				'no `coverage` provider: set `providers.coverage` (`"codecov"`) in holocron.config'
			),
		]);
	}
	/* v8 ignore start -- the real loader is only built outside tests, which always inject one */
	const loader =
		input.loader ?? new PluginLoader({ ...input.loaded.resolved, providers: { coverage: entry } }, input.context);
	/* v8 ignore stop */
	await loader.load();
	assertPluginsResolvable(loader, "upload coverage");
	if (!loader.has("coverage")) {
		const failure = loader.loadFailures().find((f) => f.key === "coverage");
		return finish([
			row(
				"coverage",
				"fail",
				`the \`coverage\` provider is not available${failure ? ` (${describeError(failure.error)})` : ""}`
			),
		]);
	}
	const provider = loader.get("coverage") as Coverage;
	if (!provider.upload) {
		return finish([row("coverage", "fail", `the \`${provider.providerName}\` provider cannot upload coverage`)]);
	}

	try {
		const result = await provider.upload({
			uploads: parsed.uploads,
			repoRoot: input.context.repoRoot,
			...(input.allowEmpty ? { allowEmpty: true } : {}),
		});
		const rows = result.flags.map((flag) => {
			if (flag.outcome === "uploaded") return row(flag.flag, "ok", `uploaded ${flag.files} file(s)`, flag.notes);
			if (flag.outcome === "skipped") {
				return row(flag.flag, "skip", flag.notes.at(-1) ?? "skipped", flag.notes.slice(0, -1));
			}
			return row(flag.flag, "fail", "the upload failed", flag.notes);
		});
		if (result.problem !== undefined && !result.flags.some((flag) => flag.outcome === "failed")) {
			rows.push(row("upload", "fail", result.problem));
		}
		return finish(rows, result.uploaded);
	} catch (err) {
		return finish([row("upload", "fail", describeError(err))]);
	}
}
