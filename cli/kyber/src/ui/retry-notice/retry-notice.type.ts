/** What {@link createRetryNotice} reads from one retry. Structurally compatible with `@theholocron/http-client`'s `RetryEvent`. */
export interface RetryNoticeEvent {
	/** The service being called, when the client knows it. */
	vendor?: string | undefined;
	/** The attempt about to be made. */
	attempt: number;
	/** How many attempts there are in all. */
	of: number;
}

/** Registers a handler for retries and returns a function that removes it. */
export type RetrySubscribe = (handler: (event: RetryNoticeEvent) => void) => () => void;
