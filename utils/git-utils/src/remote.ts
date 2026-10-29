export interface GitRemote {
	host: string;
	/** Everything before the repo name: `owner`, or `group/subgroup` on hosts with nested groups. */
	owner: string;
	repo: string;
	/** `owner/repo`. */
	slug: string;
}

/**
 * Parses a git remote URL — any host, any of the common shapes:
 *
 * - `https://github.com/owner/repo(.git)(/)`, with optional credentials or port
 * - `git@github.com:owner/repo(.git)` (scp-style SSH)
 * - `ssh://git@github.com(:22)/owner/repo(.git)`
 * - `git://github.com/owner/repo.git`
 *
 * A bracketed IPv6 host is returned without its brackets. The whole input must
 * be one remote: trailing text after the URL (apart from a `?query` or
 * `#fragment`) makes it `undefined`.
 *
 * `undefined` for anything else (a local path, an empty string, a URL with
 * fewer than two path segments).
 */
export function parseGitRemoteUrl(url: string): GitRemote | undefined {
	const input = url.trim();
	// A host is a bracketed IPv6 literal (`[::1]`, whose colons aren't separators) or a name without `:`.
	const withScheme =
		/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s]*@)?(\[[0-9a-f:.]+\]|[^:/\s]+)(?::\d+)?\/([^\s?#]+)(?:[?#]\S*)?$/i.exec(
			input
		);
	// `host:path`, not `scheme://…` (the lookahead) and not a Windows drive (`C:`, one letter).
	const scp = withScheme ? null : /^(?:[^@/\s]+@)?(\[[0-9a-f:.]+\]|[^:/\s]{2,}):(?!\/\/)([^\s]+)$/i.exec(input);
	const match = withScheme ?? scp;
	if (!match) return undefined;

	const host = match[1]!.replace(/^\[|\]$/g, "");
	// Split before trimming: dropping empty segments also drops trailing slashes
	// without a `/+$` regex, which backtracks quadratically on a long run of `/`.
	const segments = match[2]!.split("/").filter(Boolean);
	const last = segments.pop()!.replace(/\.git$/, "");
	if (last) segments.push(last);
	if (segments.length < 2) return undefined;

	const repo = segments[segments.length - 1]!;
	const owner = segments.slice(0, -1).join("/");
	return { host, owner, repo, slug: `${owner}/${repo}` };
}

/**
 * Runs `git <args>` in `options.cwd` and resolves its stdout; rejects when git
 * exits non-zero. Injectable so callers' tests don't need a real repository.
 */
export type GitExec = (args: string[], options: { cwd: string }) => Promise<string>;

// Loaded on first use so that importing this module (e.g. for the pure
// `parseGitRemoteUrl`) never touches `node:child_process` — which also keeps it
// safe for consumers whose tests mock that module.
const defaultExec: GitExec = async (args, { cwd }) => {
	const [{ execFile }, { promisify }] = await Promise.all([import("node:child_process"), import("node:util")]);
	return (await promisify(execFile)("git", args, { cwd })).stdout;
};

export interface ReadGitRemoteOptions {
	exec?: GitExec;
	/** Remote name. Default `"origin"`. */
	remote?: string;
}

/**
 * The parsed URL of a repository's remote (`git remote get-url <remote>`), or
 * `undefined` when `cwd` isn't a repository, has no such remote, git isn't
 * installed, or the URL isn't one {@link parseGitRemoteUrl} understands.
 */
export async function readGitRemote(cwd: string, options: ReadGitRemoteOptions = {}): Promise<GitRemote | undefined> {
	const exec = options.exec ?? defaultExec;
	try {
		const stdout = await exec(["remote", "get-url", options.remote ?? "origin"], { cwd });
		return parseGitRemoteUrl(stdout);
	} catch {
		return undefined;
	}
}
