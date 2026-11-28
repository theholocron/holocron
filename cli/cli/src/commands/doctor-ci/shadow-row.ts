import type { CheckRow } from "@theholocron/kyber/ui";

import { SHADOW_AGREEMENT_TARGET, type ShadowSample } from "./shadow.type.js";

const ID = "shadow";
const TITLE = "Sentinel's ci shadow agrees with the Actions aggregate";

/**
 * The `shadow` row (SPEC-0099, phase 4): do `ci / Required checks (sentinel)` and `ci / Required checks` say the same on
 * the same commit? `samples` are the newest pull requests first. A pull request is **decided** when both posted and
 * neither is still `pending`; one the shadow never posted on (it predates it) and one still running are left out, since
 * neither says the two disagree. Any decided pull request where they differ fails the row and is named. With none, the
 * row is a skip. Otherwise it counts the newest pull requests in a row that agree and passes at
 * {@link SHADOW_AGREEMENT_TARGET}, and is a skip (not a failure) below it: the shadow is still being watched. The spec
 * also asks that the agreeing set include a re-run of one leaf, a cancelled first batch, a late status, a skipped leaf and
 * a missing id; that is read by a person, not here.
 */
export function shadowRow(samples: readonly ShadowSample[], target: number = SHADOW_AGREEMENT_TARGET): CheckRow {
	const decided = samples.filter(
		(sample) =>
			sample.actions !== undefined &&
			sample.sentinel !== undefined &&
			sample.actions !== "pending" &&
			sample.sentinel !== "pending"
	);
	if (decided.length === 0) {
		return {
			id: ID,
			title: TITLE,
			status: "skip",
			detail: "no pull request has a finished verdict from both the Actions aggregate and the shadow yet",
			problems: [],
		};
	}
	const disagreements = decided.filter((sample) => sample.actions !== sample.sentinel);
	if (disagreements.length > 0) {
		return {
			id: ID,
			title: TITLE,
			status: "fail",
			detail: `${disagreements.length} of ${decided.length} decided pull requests disagree`,
			problems: disagreements.map(
				(s) => `#${s.number}: Actions said ${s.actions}, the shadow said ${s.sentinel}`
			),
		};
	}
	const consecutive = decided.length;
	return consecutive >= target
		? {
				id: ID,
				title: TITLE,
				status: "ok",
				detail: `${consecutive} consecutive pull requests agree (target ${target})`,
				problems: [],
			}
		: {
				id: ID,
				title: TITLE,
				status: "skip",
				detail: `${consecutive} of ${target} consecutive pull requests agree so far`,
				problems: [],
			};
}
