/**
 * Hand one made-up secret to a person for import into a vault. The CLI cannot write to a 1Password Environment, so the
 * hand-off is the private import file, the way `export tokens` and the heartbeat hand-off do it
 * (`.holocron/.private/.credentials`, mode 0600, never overwritten, refused unless git says it ignores it, refused on
 * Windows, deleted once the import is done). The value goes only to that file: nothing here prints, logs or returns it.
 */
import { dotenvLine, finishCredentialsFile, isGitIgnored, writeCredentialsFile } from "@theholocron/kyber/secrets";
import { errorMessage } from "@theholocron/misc-utils";

import { ignoreAdvice, resolveCredentialsFile } from "../../private-dir/index.js";
import type { HandOffSecretInput, HandOffSecretResult } from "./secret-handoff.type.js";

export async function handOffSecret(input: HandOffSecretInput): Promise<HandOffSecretResult> {
	const { print, name } = input;
	const fail = (reason: string, ...message: string[]): HandOffSecretResult => {
		for (const line of message) print(line);
		return { status: "fail", reason };
	};

	const line = dotenvLine(name, input.value);
	if (line === null) return fail("unsupported", `${name}: its value is not one a dotenv file can carry`);

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
				? `refusing to write ${name} to ${file}: git does not ignore it, so it could be committed`
				: `refusing to write ${name} to ${file}: git could not say whether it ignores it`,
			ignoreAdvice(target.isDefault, "choose a path outside the repository")
		);
	}
	let identity;
	try {
		identity = (input.writeFile ?? writeCredentialsFile)(file, `${line}\n`, false);
	} catch (err) {
		return fail(
			"write",
			`could not write ${file}: ${errorMessage(err)}`,
			"an existing file is never overwritten: finish importing it, delete it, then run the command again"
		);
	}
	print(`wrote ${name} for import`);
	const where = input.environment ? `the \`${input.environment}\` Environment` : "the Environment that holds it";
	const cleaned = await finishCredentialsFile({
		path: file,
		identity,
		print,
		holds: `the new value of ${name}`,
		importHint: `import it in the 1Password app: Developer, View Environments, ${where}, Import .env file (it replaces the old value)`,
		keep: input.keep,
		interactive: input.interactive,
		shred: input.shred,
		waitForImport: input.waitForImport,
	});
	return cleaned ? { status: "ok" } : { status: "fail", reason: "file-left" };
}
