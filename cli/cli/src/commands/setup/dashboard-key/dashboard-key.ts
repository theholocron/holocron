import { dotenvLine, finishCredentialsFile, isGitIgnored, writeCredentialsFile } from "@theholocron/kyber/secrets";
import { errorMessage } from "@theholocron/misc-utils";

import { ignoreAdvice, resolveCredentialsFile } from "../../../private-dir/index.js";
import type { HandOffDashboardKeyInput } from "./dashboard-key.type.js";

/** The 1Password variable that holds a private dashboard's view key (the `dev` layer, never synced). */
export const DASHBOARD_KEY_VARIABLE = "HOLOCRON_CHECKLY_DASHBOARD_KEY";

/**
 * Hands a private dashboard's view key over for the 1Password import, the way `export tokens` does: one
 * `HOLOCRON_CHECKLY_DASHBOARD_KEY=<value>` line in the private, git-ignored, never-overwritten
 * `.holocron/.private/.credentials`, which is deleted once the import is done. The key is never printed, logged or
 * written anywhere else. Throws with a reason that holds no key when the file cannot be written safely; the key is
 * then still in Checkly's dashboard settings.
 */
export async function handOffDashboardKey(input: HandOffDashboardKeyInput): Promise<void> {
	if ((input.platform ?? process.platform) === "win32") {
		throw new Error(
			"cannot make the file private on Windows: its mode bits are not enforced; copy the key from Checkly"
		);
	}
	const line = dotenvLine(DASHBOARD_KEY_VARIABLE, input.key);
	if (line === null) {
		throw new Error(`the key is a value dotenv cannot carry unchanged, so add ${DASHBOARD_KEY_VARIABLE} by hand`);
	}
	const target = resolveCredentialsFile(input.repoRoot, undefined, input.makeDir);
	// Only a positive answer lets the file be written: if git cannot say, it might be committed.
	const git = (input.isIgnored ?? isGitIgnored)(target.path);
	if (git === "tracked" || git === "unknown") {
		const why = git === "tracked" ? "git does not ignore it" : "git could not say whether it ignores it";
		throw new Error(
			`refusing to write ${target.path}: ${why}; ${ignoreAdvice(target.isDefault, "choose another path")}`
		);
	}
	let identity;
	try {
		identity = (input.writeFile ?? writeCredentialsFile)(target.path, `${line}\n`, false);
	} catch (err) {
		throw new Error(
			`could not write ${target.path}: ${errorMessage(err)} (an existing file is never overwritten: delete it and run setup again)`,
			{ cause: err }
		);
	}
	const gone = await finishCredentialsFile({
		path: target.path,
		identity,
		print: input.print,
		holds: `the dashboard key (${DASHBOARD_KEY_VARIABLE})`,
		importHint:
			"import it in the 1Password app, in the dev layer: Developer, View Environments, the Environment, Import .env file",
		interactive: input.interactive ?? Boolean(process.stdin.isTTY),
		shred: input.shred,
		waitForImport: input.waitForImport,
	});
	if (!gone) throw new Error(`${target.path} still holds the key in plain text: delete it`);
}
