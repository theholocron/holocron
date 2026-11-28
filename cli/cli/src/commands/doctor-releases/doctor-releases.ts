/**
 * `holocron doctor releases` — did npm receive every release tag the repository has?
 *
 * Read-only, and it needs no provider: it reads git tags, the version groups of the `release` task and npm's public
 * registry. semantic-release pushes its tag, and the `refs/notes/semantic-release-<tag>` note, before it publishes, so
 * a publish that fails leaves a tag npm never got, and every later run sees the tag, finds nothing new and ends green
 * (a sigstore 409 on an identical tarball, `ENEEDAUTH` from an expired Trusted Publisher entry). One row per release
 * line and channel (`latest`, `alpha`): the line's newest tag against what each of its packages serves on that
 * dist-tag. A package behind fails the row, which names the tag and the note to delete and the two known causes.
 * A tag younger than the grace period is a skip: its own release may still be publishing.
 */

import type { NpmDistTags } from "@theholocron/astromech";
import { checkReleaseLines, type ReleaseTagCheck, wedgeFix } from "@theholocron/astromech";
import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import type { DoctorReleasesReport, ReleasesIo, RunDoctorReleasesInput } from "./doctor-releases.type.js";
import { realReleasesIo } from "./real-releases-io.js";
import { releaseLines } from "./release-lines.js";

const DEFAULT_GRACE_SECONDS = 30 * 60;
const CONCURRENCY = 8;

/** The dist-tags of every name, a few requests at a time. */
async function readDistTags(io: ReleasesIo, names: string[]): Promise<Map<string, NpmDistTags>> {
	const found = new Map<string, NpmDistTags>();
	for (let i = 0; i < names.length; i += CONCURRENCY) {
		const batch = names.slice(i, i + CONCURRENCY);
		const tags = await Promise.all(batch.map((name) => io.distTags(name)));
		batch.forEach((name, index) => found.set(name, tags[index]));
	}
	return found;
}

function rowOf(check: ReleaseTagCheck): CheckRow {
	const id = `releases-${check.line}-${check.distTag}`;
	const title = `${check.tag} reached npm (${check.distTag})`;
	if (check.state === "published") return { id, title, status: "ok", detail: "npm serves it", problems: [] };
	const behind = check.behind.map(
		(p) => `${p.name} serves ${p.onNpm ?? `nothing on ${check.distTag}`}, tag is ${check.version}`
	);
	if (check.state === "pending") {
		return {
			id,
			title,
			status: "skip",
			detail: `${check.behind.length} package(s) behind, but the tag is new: its release may still be publishing`,
			problems: [],
		};
	}
	return {
		id,
		title,
		status: "fail",
		detail: `${check.behind.length} package(s) behind: the tag was pushed and the publish failed`,
		problems: [...behind, ...wedgeFix(check.tag)],
	};
}

export async function runDoctorReleases(input: RunDoctorReleasesInput): Promise<DoctorReleasesReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const io = input.io ?? realReleasesIo(input.context.repoRoot);
	const lines = releaseLines({ tasks: input.loaded.resolved.tasks ?? [] }, io);

	let rows: CheckRow[];
	try {
		const tags = io.tags();
		const npm = await readDistTags(io, [...new Set(lines.flatMap((line) => line.packages))]);
		const checks = checkReleaseLines({
			lines,
			tags,
			npm,
			now: io.now(),
			graceSeconds: input.graceSeconds ?? DEFAULT_GRACE_SECONDS,
		});
		rows =
			checks.length > 0
				? checks.map(rowOf)
				: [
						{
							id: "releases",
							title: "release tags",
							status: "skip",
							detail: "no release tags to check",
							problems: [],
						},
					];
	} catch (err) {
		rows = [
			{
				id: "releases",
				title: "release tags",
				status: "skip",
				detail: `could not read tags or npm: ${errorMessage(err)}`,
				problems: [],
			},
		];
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor releases");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: [...new Set(rows.map((r) => r.detail))].join("; ") } : {}),
	};
}
