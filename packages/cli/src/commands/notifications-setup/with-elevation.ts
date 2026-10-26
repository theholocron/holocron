import { ElevationRequiredError } from "../../plugin/index.js";
import { style } from "../../ui/style/index.js";
import type { ElevationDeps } from "./with-elevation.type.js";

/**
 * Runs an edit that may need a permission the bot should not keep. When the provider says it does
 * ({@link ElevationRequiredError}) and a person is there to answer, walks them through it: the link that gives the
 * permission, then a retry; and afterwards the link that takes it away, then a check that it really is gone. The
 * consent clicks stay theirs; the ordering and the "forgot to take it away" mistake do not.
 *
 * Without someone to answer (`pause` absent) the error is passed on unchanged, so a script still gets the
 * explanation it always did. A permission still held afterwards is returned as a `todo`, which the caller reports
 * as a failure: the edit was made, but the run is not finished.
 */
export async function withElevation<T extends { updated: string[]; todo?: string[] }>(
	run: () => Promise<T>,
	deps: ElevationDeps
): Promise<T> {
	try {
		return await run();
	} catch (err) {
		const { notifications, pause, print } = deps;
		if (!(err instanceof ElevationRequiredError) || !pause || !err.elevation.grantUrl) throw err;
		const { permission, grantUrl, revokeUrl } = err.elevation;

		print(`  ${style.skip(`${deps.label} needs ${permission} for this one edit`)}`);
		print(`    1. approve it: ${grantUrl}`);
		await pause(`Press Enter once ${permission} is approved to try again`);
		const result = await run();

		const problems = [...(result.todo ?? [])];
		if (revokeUrl) {
			print(`    2. take it away again: ${revokeUrl}`);
			await pause(`Press Enter once ${permission} is taken away to check it`);
			if (notifications.holdsPermission) {
				if (await notifications.holdsPermission(permission)) {
					problems.push(
						`${notifications.providerName} still holds ${permission}; use the link above to take it away, then run \`holocron doctor notifications\` to check`
					);
				} else {
					print(`  ${style.success(`${permission} is gone again`)}`);
				}
			}
		}
		return { ...result, todo: problems };
	}
}
