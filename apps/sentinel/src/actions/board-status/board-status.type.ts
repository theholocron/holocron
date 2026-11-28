import type { SentinelCheckRun } from "../../utils/webhook/index.js";

/** What a delivery asks of the board, normalized from the webhook event. */
export type BoardStatusTrigger =
	/** A `pull_request` action that starts, ends or re-labels the work (opened, reopened, ready, draft, closed). */
	| { kind: "pull_request"; action: string; numbers: number[] }
	/** The `ci / Required checks` aggregate completed; the pull requests are the ones its commit is in. */
	| { kind: "check_run"; numbers: number[]; check: SentinelCheckRun };
