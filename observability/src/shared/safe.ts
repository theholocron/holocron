/**
 * Receives a vendor error an adapter swallowed. `context` names the call, such
 * as `"sentry.captureException"` or `"posthog.fetch"`. Pass one as `onError`
 * to log or count adapter failures; the default is to ignore them.
 */
export type OnError = (error: unknown, context: string) => void;

/**
 * Reports `error` to `onError`, guarded so the callback can never throw or
 * start a loop: a throw from it is dropped and it is not called again for that
 * failure.
 */
export function report(onError: OnError | undefined, error: unknown, context: string): void {
	if (!onError) return;
	try {
		onError(error, context);
	} catch {
		// A broken reporter must not become a second failure.
	}
}

/**
 * Runs a vendor call so that nothing it throws reaches the application.
 * Telemetry is best effort: a broken SDK, a blocked request or a bad
 * configuration must never take the app down. A throw goes to `onError` (when
 * given) with `context`; the result is then `undefined`.
 */
export function safely<T>(call: () => T, onError?: OnError, context = "call"): T | undefined {
	try {
		return call();
	} catch (error) {
		report(onError, error, context);
		return undefined;
	}
}

/**
 * Awaits a vendor promise and discards a rejection, like {@link safely} for
 * asynchronous calls. Resolves `undefined` on a throw or a rejection.
 */
export async function safelyAsync<T>(
	call: () => Promise<T> | T,
	onError?: OnError,
	context = "call"
): Promise<T | undefined> {
	try {
		return await call();
	} catch (error) {
		report(onError, error, context);
		return undefined;
	}
}
