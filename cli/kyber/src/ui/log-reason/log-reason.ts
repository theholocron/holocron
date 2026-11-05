/**
 * What to put in structured logs: the plain message of the underlying error, with no response body. The detail
 * {@link describeError} adds is for the person at the terminal; a provider's raw body has no business in telemetry. A
 * wrapper error carries the original as `cause`, so this looks through one level.
 */
export function logReason(err: unknown): string {
	const root = err instanceof Error && err.cause !== undefined ? err.cause : err;
	return root instanceof Error ? root.message : String(root);
}
