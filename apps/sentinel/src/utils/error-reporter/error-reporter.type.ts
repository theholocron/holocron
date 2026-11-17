/** Reports a failed check without ever throwing, and sends what it holds before the function returns. */
export interface ErrorReporter {
	/** Marks a delivery as started; each call is paired with one `flush()`, so overlapping deliveries share the sink. */
	begin(): void;
	/** Reports `err`; a sink that fails is swallowed, so one check's failure never stops another. */
	capture(err: unknown): void;
	/**
	 * Ends one delivery. When it is the last one running, ends the session, sends what is pending and closes the sink;
	 * an earlier one returns at once. Resolves (never rejects) once the sink has finished or failed.
	 */
	flush(): Promise<void>;
}
