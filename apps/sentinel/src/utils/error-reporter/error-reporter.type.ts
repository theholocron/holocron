/** Reports a failed check without ever throwing, and sends what it holds before the function returns. */
export interface ErrorReporter {
	/** Reports `err`; a sink that fails is swallowed, so one check's failure never stops another. */
	capture(err: unknown): void;
	/** Sends what is pending. Resolves (never rejects) once the sink has finished or failed. */
	flush(): Promise<void>;
}
