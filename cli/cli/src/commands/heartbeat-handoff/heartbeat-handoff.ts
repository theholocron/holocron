/**
 * Hand the ping URLs of heartbeats just made to 1Password. A ping URL is a credential (anyone holding it can fake a
 * success) and the CLI cannot write to a 1Password Environment, so the hand-off is the private import file, the way
 * `export tokens` does it: `.holocron/.private/.credentials`, mode 0600, never overwritten, deleted once the import is
 * done. The lines go only to that file: never to a terminal or a redirected file, and nothing here prints, logs or
 * returns a URL. The names are `HOLOCRON_HEARTBEAT_<NAME>`, for the `ci` layer.
 */
import { dotenvLine, finishCredentialsFile, isGitIgnored, writeCredentialsFile } from "@theholocron/kyber/secrets";
import { errorMessage } from "@theholocron/misc-utils";

import { ignoreAdvice, resolveCredentialsFile } from "../../private-dir/index.js";
import { heartbeatSecretName } from "../heartbeat-secret-name/index.js";
import type { HandOffHeartbeatsInput, HandOffHeartbeatsResult } from "./heartbeat-handoff.type.js";

export async function handOffHeartbeats(input: HandOffHeartbeatsInput): Promise<HandOffHeartbeatsResult> {
	const { print } = input;
	const fail = (reason: string, ...message: string[]): HandOffHeartbeatsResult => {
		for (const line of message) print(line);
		return { status: "fail", written: [], reason };
	};
	if (input.pings.length === 0) return { status: "skip", written: [], reason: "no heartbeat was made" };

	const lines = new Map<string, string>();
	for (const ping of input.pings) {
		const name = heartbeatSecretName(ping.name);
		if (!name) return fail("name", `heartbeat "${ping.name}" has no name a variable can carry`);
		if (lines.has(name)) return fail("collision", `two heartbeats are named ${name}: rename one`);
		const line = dotenvLine(name, ping.url);
		if (line === null)
			return fail("unsupported", `${name}: its address is not one a dotenv file can carry, so add it by hand`);
		lines.set(name, line);
	}

	if ((input.platform ?? process.platform) === "win32") {
		return fail("windows", "cannot make the file private on Windows: its mode bits are not enforced");
	}
	const target = resolveCredentialsFile(input.base, undefined, input.makeDir);
	const file = target.path;
	// Only a positive answer lets the file be written: if git cannot say, it might be committed.
	const git = (input.isIgnored ?? isGitIgnored)(file);
	if (git === "tracked" || git === "unknown") {
		return fail(
			"not-ignored",
			git === "tracked"
				? `refusing to write ping URLs to ${file}: git does not ignore it, so it could be committed`
				: `refusing to write ping URLs to ${file}: git could not say whether it ignores it`,
			ignoreAdvice(target.isDefault, "choose a path outside the repository")
		);
	}
	const names = [...lines.keys()].sort();
	let identity;
	try {
		identity = (input.writeFile ?? writeCredentialsFile)(
			file,
			`${names.map((n) => lines.get(n)).join("\n")}\n`,
			false
		);
	} catch (err) {
		return fail(
			"write",
			`could not write ${file}: ${errorMessage(err)}`,
			"an existing file is never overwritten: finish importing it, delete it, then run setup again"
		);
	}
	print(`wrote ${names.length} heartbeat ping URL(s) for import: ${names.join(", ")}`);
	print("they belong to the `ci` layer's 1Password Environment and a repo-scoped `repo.secrets.sync` entry");
	const cleaned = await finishCredentialsFile({
		path: file,
		identity,
		print,
		holds: "the heartbeats' ping URLs",
		importHint:
			"import it in the 1Password app: Developer, View Environments, the `ci` Environment, Import .env file",
		keep: input.keep,
		interactive: input.interactive,
		shred: input.shred,
		waitForImport: input.waitForImport,
	});
	return cleaned ? { status: "ok", written: names } : { status: "fail", written: names, reason: "file-left" };
}
