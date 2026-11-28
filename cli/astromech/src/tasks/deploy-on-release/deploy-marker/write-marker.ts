import type { Run } from "../../../utils/index.js";

/**
 * Records that a package is deployed at `to`: moves the tag `tag` there and pushes it. Returns a problem line, or
 * `undefined` on success.
 *
 * The push authenticates with `token` through an explicit `Authorization` header handed to git in the environment
 * of that one command (`GIT_CONFIG_*`), so the token is never in `.git/config`, never in argv and never in a
 * message this returns.
 */
export function writeMarker(run: Run, cwd: string, tag: string, to: string, token: string): string | undefined {
	const scrub = (text: string) => text.replaceAll(token, "***").replaceAll(header(token), "***");
	const made = run("git", ["tag", "--force", tag, to], { cwd });
	if (made.status !== 0) return `couldn't tag ${tag}: ${scrub(made.stderr.trim()) || made.status}`;
	const pushed = run("git", ["push", "--force", "origin", `refs/tags/${tag}`], {
		cwd,
		env: {
			...process.env,
			GIT_CONFIG_COUNT: "1",
			GIT_CONFIG_KEY_0: "http.extraheader",
			GIT_CONFIG_VALUE_0: `AUTHORIZATION: ${header(token)}`,
		},
	});
	return pushed.status === 0 ? undefined : `couldn't push ${tag}: ${scrub(pushed.stderr.trim()) || pushed.status}`;
}

/** The basic-auth credential GitHub takes for a token over HTTPS. */
function header(token: string): string {
	return `basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
}
