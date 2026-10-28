import { execFileSync } from "node:child_process";

/** Runs `git` with `args` in `cwd`, feeding it `input` on stdin, and returns stdout. */
export type GitRun = (args: string[], input: string, cwd: string) => string;

const defaultGitRun: GitRun = (args, input, cwd) =>
	execFileSync("git", args, { cwd, input, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

/**
 * The repo-relative files each of `hashes` changed, from one
 * `git diff-tree --stdin` call. A commit that changes nothing (or a merge
 * commit) maps to `[]`. Paths come back verbatim, not quoted, whatever they
 * contain.
 */
export function commitFiles(
	cwd: string,
	hashes: readonly string[],
	run: GitRun = defaultGitRun
): Map<string, string[]> {
	const files = new Map<string, string[]>(hashes.map((hash) => [hash, []]));
	if (hashes.length === 0) return files;

	const out = run(
		["-c", "core.quotePath=false", "diff-tree", "--stdin", "--name-only", "-r", "--root"],
		`${hashes.join("\n")}\n`,
		cwd
	);
	let current: string[] | undefined;
	for (const line of out.split("\n")) {
		if (line === "") continue;
		const known = files.get(line);
		if (known) current = known;
		else current?.push(line);
	}
	return files;
}
