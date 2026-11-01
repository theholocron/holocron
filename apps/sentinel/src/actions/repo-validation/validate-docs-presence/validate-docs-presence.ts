import {
	evaluateDocsPresence,
	isAddedDocComment,
	isFeat,
	packageOf,
	parseSkipDocs,
} from "@theholocron/astromech/repo-validation";
import type { GitHubClient } from "@theholocron/github-client";
import { ProviderApiError } from "@theholocron/http-client";

import { decodeContents } from "../../../utils/index.js";
import type {
	FeatDocsWarning,
	NewPublicPackage,
	ValidateDocsPresenceInput,
	ValidateDocsPresenceResult,
} from "./validate-docs-presence.type.js";

const ENTRY_SUFFIX = "/src/index.ts";

/** `true` for any file the check counts as documentation: anything under `docs/` or a `.md` / `.mdx` file. */
export function isDocsFile(path: string): boolean {
	return path.startsWith("docs/") || path.endsWith(".md") || path.endsWith(".mdx");
}

/** The `package.json` at `dir` on `ref`, or `undefined` when the folder has none (404) or the file is not JSON. */
async function readPackage(
	client: Pick<GitHubClient, "git">,
	repo: string,
	dir: string,
	ref: string
): Promise<{ private?: boolean } | undefined> {
	try {
		const contents = await client.git.getContents(repo, `${dir}/package.json`, ref);
		return JSON.parse(decodeContents(contents.content)) as { private?: boolean };
	} catch (err) {
		// No package.json (404) or one that isn't JSON: not a package. Anything
		// else (auth, rate limit, 5xx) is a real failure, not a skip.
		if (err instanceof SyntaxError || (err instanceof ProviderApiError && err.status === 404)) return undefined;
		throw err;
	}
}

/** The folders a changed file could be source of: before each `/src/`, or the file's own folder for a root `index`. */
function candidateDirs(file: string): string[] {
	if (file.includes("node_modules/")) return [];
	const dirs: string[] = [];
	for (let at = file.indexOf("/src/"); at > 0; at = file.indexOf("/src/", at + 1)) dirs.push(file.slice(0, at));
	const slash = file.lastIndexOf("/");
	if (dirs.length === 0 && slash > 0 && /^index\.[cm]?[jt]s$/.test(file.slice(slash + 1))) {
		dirs.push(file.slice(0, slash));
	}
	return dirs;
}

/**
 * Runs the docs-presence check for one PR — the same rules as `holocron probe docs presence`
 * (`@theholocron/astromech/repo-validation`), fed from the webhook payload and the GitHub API instead of git. It
 * finds the new public packages (an added `<dir>/src/index.ts` whose `package.json` is not private) and, for a
 * `feat`, the public packages whose source changed without a docs signal or a `[skip docs] <reason>` marker.
 * Warning-only: the result says what to warn about, it never fails anything.
 */
export async function validateDocsPresence(input: ValidateDocsPresenceInput): Promise<ValidateDocsPresenceResult> {
	const { client, repo, pullNumber, ref, prTitle = "", prBody = "" } = input;
	const changedFiles = await client.pulls.listFiles(repo, pullNumber);
	const names = changedFiles.map((f) => f.filename);

	const addedEntries = names.filter(
		(name, i) =>
			changedFiles[i]!.status === "added" && name.endsWith(ENTRY_SUFFIX) && !name.includes("node_modules")
	);
	const dirsToRead = new Set([
		...names.flatMap(candidateDirs),
		...addedEntries.map((f) => f.slice(0, -ENTRY_SUFFIX.length)),
	]);
	const packages = new Map<string, { private?: boolean } | undefined>();
	for (const dir of dirsToRead) packages.set(dir, await readPackage(client, repo, dir, ref));
	const readFrom = (dir: string) => packages.get(dir);

	const newPackages: NewPublicPackage[] = [];
	for (const entry of addedEntries) {
		const dir = entry.slice(0, -ENTRY_SUFFIX.length);
		const pkg = packages.get(dir);
		if (pkg && !pkg.private) newPackages.push({ name: dir.slice(dir.lastIndexOf("/") + 1), entry });
	}

	const hasDocsChange = names.some(isDocsFile);
	const result: ValidateDocsPresenceResult = {
		newPackages,
		hasDocsChange,
		isFeat: false,
		featWarnings: [],
		skipped: [],
		missingReason: false,
		valid: newPackages.length === 0 || hasDocsChange,
	};

	const changedPackages = [...new Set(names.flatMap((f) => packageOf(f, readFrom) ?? []))];
	if (changedPackages.length === 0) return result;

	const commits = await client.pulls.listCommits(repo, pullNumber);
	const subjects = [prTitle, ...commits.map((c) => c.commit.message.split("\n")[0]!)].filter(Boolean);
	result.isFeat = isFeat(subjects);
	if (!result.isFeat) return result;

	const { warn, skipped, missingReason } = evaluateDocsPresence({
		packages: changedPackages,
		changedFiles: names,
		addedCommentLines: (dir) =>
			changedFiles
				.filter((f) => f.filename.startsWith(`${dir}/src/`) || f.filename === `${dir}/index.ts`)
				.flatMap((f) => (f.patch ?? "").split("\n").filter(isAddedDocComment)),
		skip: parseSkipDocs(`${prBody}\n${commits.map((c) => c.commit.message).join("\n")}`),
	});
	const featWarnings: FeatDocsWarning[] = warn.map((dir) => ({
		dir,
		path: names.find((f) => packageOf(f, readFrom) === dir)!,
	}));
	return { ...result, featWarnings, skipped, missingReason, valid: result.valid && featWarnings.length === 0 };
}
