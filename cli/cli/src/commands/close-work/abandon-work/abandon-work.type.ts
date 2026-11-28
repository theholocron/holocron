import type { CheckRow } from "@theholocron/kyber/ui";

import type { PullRequest, Source } from "../../../plugin/index.js";
import type { RunCloseWorkInput } from "../run-close-work/index.js";

/** What {@link abandonWork} needs: the run's input, the providers it loaded and the pull request it found. */
export interface AbandonWorkInput {
	/** The `close work` input the run began with (issue, flags, the injected seams). */
	input: RunCloseWorkInput;
	/** The issue's key as the person gave it. */
	key: string;
	/** The `source` provider. */
	source: Source;
	/** The open pull request of the work, when there is one. */
	pullRequest?: PullRequest;
	/** The loader, handed on to `update issue`. */
	loader: NonNullable<RunCloseWorkInput["loader"]>;
	/** The `ask` the run uses, so the prompts and the terminal check are in one place. */
	ask: (message: string) => Promise<boolean>;
}

/** What {@link abandonWork} did. */
export interface AbandonWorkResult {
	/** The rows of the abandonment. */
	rows: CheckRow[];
	/** Set when the person said no to the first question, so nothing was written. */
	cancelled?: boolean;
}
