/** Where an aggregate check stands on one commit. */
export type ShadowVerdict = "success" | "failure" | "pending";

/** One pull request's two verdicts: the Actions poller's `ci / Required checks` and Sentinel's shadow of it. */
export interface ShadowSample {
	/** The pull request's number. */
	number: number;
	/** The Actions poller's verdict, `undefined` when it never posted on the commit. */
	actions?: ShadowVerdict;
	/** Sentinel's shadow verdict, `undefined` when it never posted on the commit. */
	sentinel?: ShadowVerdict;
}

/** The agreement SPEC-0099 asks of the shadow before the real name is posted: this many consecutive pull requests. */
export const SHADOW_AGREEMENT_TARGET = 20;

/** How many of the newest pull requests `doctor ci --shadow` reads by default. */
export const SHADOW_DEFAULT_LIMIT = 40;
