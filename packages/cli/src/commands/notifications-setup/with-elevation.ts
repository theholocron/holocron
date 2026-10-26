import { ElevationRequiredError } from "../../plugin/index.js";
import { style } from "../../ui/style/index.js";
import type { ElevationDeps } from "./with-elevation.type.js";

/**
 * Runs an edit that may need a permission the bot should not keep. When the provider says it does
 * ({@link ElevationRequiredError}) and a person is there to answer, walks them through it: the link that gives the
 * permission, then a retry; and afterwards the link that takes it away, then a check that it really is gone. The
 * consent clicks stay theirs; the ordering and the "forgot to take it away" mistake do not.
 *
 * Taking it away is attempted whatever the retry does, and anything that stops it being done or proven is a `todo`
 * (reported as a failure) or, when the retry itself failed, a printed failure beside the error.
 *
 * Without someone to answer (`pause` absent) the error is passed on unchanged, so a script still gets the
 * explanation it always did.
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
		const { permission, grantUrl, revokeUrl, applied } = err.elevation;
		// A refusal for lost access reads the same as one for a missing permission: if the bot already holds it,
		// granting it again would fix nothing, so say what the provider said.
		const holds = await notifications.holdsPermission?.(permission).catch(() => false);
		if (holds) throw err;

		print(`  ${style.skip(`${deps.label} needs ${permission} for this one edit`)}`);
		print(`    1. approve it: ${grantUrl}`);
		await pause(`Press Enter once ${permission} is approved to try again`);
		let result: T | undefined;
		let failure: unknown;
		try {
			result = await run();
		} catch (retryErr) {
			failure = retryErr;
		}

		// Whatever happened, the permission must not be left behind unnoticed.
		let leftover: string | undefined;
		if (!revokeUrl) {
			leftover = `no link could be built to take ${permission} away; remove it from ${notifications.providerName}'s role by hand, then run \`holocron doctor notifications\``;
		} else {
			print(`    2. take it away again: ${revokeUrl}`);
			await pause(`Press Enter once ${permission} is taken away to check it`);
			const holdsNow = await notifications.holdsPermission?.(permission).catch(() => undefined);
			if (holdsNow === undefined) {
				leftover = `could not check that ${permission} is gone; confirm it in ${notifications.providerName}'s role, then run \`holocron doctor notifications\``;
			} else if (holdsNow) {
				leftover = `${notifications.providerName} still holds ${permission}; use the link above to take it away, then run \`holocron doctor notifications\` to check`;
			} else {
				print(`  ${style.success(`${permission} is gone again`)}`);
			}
		}
		if (failure !== undefined) {
			if (leftover) print(`  ${style.fail(leftover)}`);
			throw failure;
		}
		return {
			...result!,
			updated: [...new Set([...(applied ?? []), ...result!.updated])],
			todo: [...(result!.todo ?? []), ...(leftover ? [leftover] : [])],
		};
	}
}
