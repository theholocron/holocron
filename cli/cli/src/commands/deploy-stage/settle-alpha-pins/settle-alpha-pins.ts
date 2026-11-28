import type { AlphaReleaseLookup } from "../alpha-release/index.js";
import { pinAlphaReleases, type PinnedAlphaReleases } from "../pin-alpha-releases/index.js";
import type { SettleAlphaPinsOptions } from "./settle-alpha-pins.type.js";

/** Milliseconds between look-ups: a release publishes its packages one after another, over a few minutes. */
export const DEFAULT_PIN_WAITS_MS: readonly number[] = [15_000, 30_000, 60_000, 60_000];

function blockFor(milliseconds: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

/**
 * Pins the `alpha` releases (`pinAlphaReleases()`) and looks them up again, after a wait, while a pinned release's exact
 * peer differs from the version staged for it. A deploy that starts while a release is publishing reads some tags before
 * the release and some after, and the install Vercel runs then fails; once every package reports the same release the
 * look-ups agree.
 *
 * @throws when the look-ups still disagree after the last try, naming each package and the versions that differ, so the
 * stage stops with the cause and not an install error on Vercel.
 */
export function settleAlphaPins(
	installed: Record<string, string>,
	lookup: AlphaReleaseLookup,
	options: SettleAlphaPinsOptions = {}
): PinnedAlphaReleases {
	const waits = options.waits ?? DEFAULT_PIN_WAITS_MS;
	const sleep = options.sleep ?? blockFor;
	const print = options.print ?? (() => {});
	let pinned = pinAlphaReleases(installed, lookup);
	for (const wait of waits) {
		if (pinned.mismatches.length === 0) return pinned;
		print(
			`  the alpha tags do not agree yet (${pinned.mismatches.length} mismatched); looking again in ${Math.round(wait / 1000)}s`
		);
		sleep(wait);
		pinned = pinAlphaReleases(installed, lookup);
	}
	if (pinned.mismatches.length > 0) {
		throw new Error(
			[
				"npm's alpha tags still do not agree after waiting, so the staged install would fail; a release is probably still publishing. Run the deploy again once it has finished —",
				...pinned.mismatches.map((mismatch) => `  - ${mismatch}`),
			].join("\n")
		);
	}
	return pinned;
}
