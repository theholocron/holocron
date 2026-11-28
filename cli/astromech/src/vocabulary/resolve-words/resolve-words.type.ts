import type { LegacyTarget } from "../legacy-names/index.js";

/** The words name one task, or the several successors of an old name. */
export interface ResolvedTask {
	kind: "task";
	targets: LegacyTarget[];
	/** The words left after the name: forwarded to the task, with the passthrough. */
	rest: string[];
	/** The old dotted name that was used, when one was (for the deprecation notice). */
	legacy?: string;
}

/** The words name a suite (`test`): every configured leaf. */
export interface ResolvedSuite {
	kind: "suite";
	suite: string;
	rest: string[];
}

/** What the words after `holocron run` name. */
export type ResolvedWords = ResolvedTask | ResolvedSuite | { kind: "unknown" };
