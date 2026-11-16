import { join } from "node:path";

import type { CoverageUploadFlagResult, CoverageUploadInput, CoverageUploadResult } from "@theholocron/cli";

import { fetchOidcToken } from "./fetch-oidc-token.js";
import { namesSourceFile } from "./names-source-file.js";
import { retryWithWait } from "./retry-with-wait.js";
import { rootReport } from "./root-report.js";
import type { UploadDeps } from "./upload.type.js";

/** How many times a flag's upload is tried, and the wait after try `n` (15 s times `n`). */
const ATTEMPTS = 4;
const waitMs = (n: number) => n * 15_000;

/** A flag as part of a file name: anything outside letters, digits, `.`, `_` and `-` becomes `_`. */
const fileSafe = (flag: string) => flag.replace(/[^\w.-]/g, "_");

/**
 * Uploads each group's reports to Codecov under the group's flag, authenticated with the job's OIDC token.
 *
 * The same steps the shell action took: a token before the commit is announced (`create-commit`) and the report opened
 * (`create-report`), then, per group, the reports its globs match, each with a report that names no source file left out
 * and the rest uploaded as copies whose `SF:` paths start at the repo root, in one `do-upload` that is retried (a fresh
 * token before every try, 15 s times the attempt between them). A group with nothing to upload is skipped with a note; a
 * group that fails every try ends the run. Throws (never printing a token) for what stops the run before a group: no
 * OIDC token to ask for, malformed input, a Codecov CLI that cannot be trusted, a failed `create-commit` or
 * `create-report`.
 */
export async function uploadCoverage(input: CoverageUploadInput, deps: UploadDeps): Promise<CoverageUploadResult> {
	const requestUrl = deps.env("ACTIONS_ID_TOKEN_REQUEST_URL");
	const requestToken = deps.env("ACTIONS_ID_TOKEN_REQUEST_TOKEN");
	if (!requestUrl || !requestToken) {
		throw new Error("No OIDC token available: give the job `permissions: id-token: write`.");
	}
	for (const group of input.uploads) {
		if (!group.flag || group.files.length === 0 || group.files.some((pattern) => !pattern)) {
			throw new Error("Every upload needs a flag and at least one files pattern.");
		}
	}

	// The token is short-lived (about five minutes) and about eighty uploads take longer, so it is fetched again before
	// every upload: a token reused past its life is answered with "Repository not found".
	const freshToken = async (): Promise<string> => {
		const token = await fetchOidcToken({ requestUrl, requestToken, fetch: deps.fetch });
		deps.mask(token);
		return token;
	};

	const cli = await deps.prepareCli();
	// What codecov-action does before it uploads: tell Codecov about the commit and open the report the per-flag uploads
	// attach to. Uploading alone leaves the report unprocessed and posts no status.
	const token = await freshToken();
	const commit = cli.createCommit(token);
	if (!commit.ok) throw new Error(`create-commit failed: ${commit.stderr || "no output"}`);
	const report = cli.createReport(token);
	if (!report.ok) throw new Error(`create-report failed: ${report.stderr || "no output"}`);

	const scratch = deps.makeTempDir();
	const flags: CoverageUploadFlagResult[] = [];
	let uploaded = 0;
	let problem: string | undefined;

	for (const group of input.uploads) {
		const notes: string[] = [];
		const matched = [...new Set(group.files.flatMap((pattern) => deps.expandGlob(pattern, input.repoRoot)))];
		const copies: string[] = [];
		for (const file of matched) {
			const content = deps.readFile(join(input.repoRoot, file));
			if (!namesSourceFile(content)) {
				notes.push(`${file} names no source file, left out`);
				continue;
			}
			const copy = join(scratch, `${fileSafe(group.flag)}.${copies.length + 1}.info`);
			deps.writeFile(copy, rootReport(content, file));
			copies.push(copy);
		}
		if (copies.length === 0) {
			notes.push("no coverage files");
			deps.log(`· ${group.flag}: no coverage files`);
			flags.push({ flag: group.flag, outcome: "skipped", files: 0, notes });
			continue;
		}
		deps.log(`→ ${group.flag}: ${copies.length} file(s)`);
		try {
			await retryWithWait({
				attempts: ATTEMPTS,
				waitMs,
				sleep: deps.sleep,
				onRetry: (n, _error, wait) =>
					deps.log(
						`${group.flag} upload failed (attempt ${n} of ${ATTEMPTS}); trying again in ${wait / 1000}s.`
					),
				attempt: async () => {
					const result = cli.doUpload(await freshToken(), group.flag, copies);
					if (!result.ok) throw new Error(result.stderr || "the Codecov CLI exited non-zero");
				},
			});
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			problem = `Codecov rejected the ${group.flag} upload ${ATTEMPTS} times: ${reason}`;
			notes.push(problem);
			flags.push({ flag: group.flag, outcome: "failed", files: 0, notes });
			break;
		}
		uploaded += 1;
		flags.push({ flag: group.flag, outcome: "uploaded", files: copies.length, notes });
	}

	if (problem === undefined && uploaded === 0 && !input.allowEmpty) {
		problem = "No group has a coverage file, so nothing was uploaded.";
	}
	return { flags, uploaded, ...(problem === undefined ? {} : { problem }) };
}
