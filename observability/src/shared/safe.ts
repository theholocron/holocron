/**
 * Runs a vendor call so that nothing it throws reaches the application.
 * Telemetry is best effort: a broken SDK, a blocked request or a bad
 * configuration must never take the app down. Returns `undefined` on a throw.
 */
export function safely<T>(call: () => T): T | undefined {
	try {
		return call();
	} catch {
		return undefined;
	}
}

/**
 * Awaits a vendor promise and discards a rejection, like {@link safely} for
 * asynchronous calls. Resolves `undefined` on a throw or a rejection.
 */
export async function safelyAsync<T>(call: () => Promise<T> | T): Promise<T | undefined> {
	try {
		return await call();
	} catch {
		return undefined;
	}
}
