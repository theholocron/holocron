import type { LegacyTarget } from "../legacy-names/index.js";

/** What the words after `holocron run` name. */
export type ResolvedWords =
	| {
			/** One task, or the several successors of an old name. */
			kind: "task";
			targets: LegacyTarget[];
			/** The words left after the name: the `[job]` argument and the passthrough. */
			rest: string[];
			/** The old dotted name that was used, when one was (for the deprecation notice). */
			legacy?: string;
	  }
	| {
			/** A suite (`test`): every configured leaf. */
			kind: "suite";
			suite: string;
			rest: string[];
	  }
	| { kind: "unknown" };
