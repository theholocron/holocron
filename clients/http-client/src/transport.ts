/**
 * Node's `fetch` rejects with a bare `TypeError: fetch failed`; the reason (a DNS miss, a connect timeout, a reset) is on
 * `cause`, and for a host with both IPv4 and IPv6 addresses it is one level deeper, in an `AggregateError`.
 */
export function transportCode(err: unknown): string | undefined {
	const cause = err instanceof Error ? err.cause : undefined;
	if (!cause || typeof cause !== "object") return undefined;
	const { code, errors } = cause as { code?: unknown; errors?: unknown };
	if (typeof code === "string") return code;
	if (Array.isArray(errors)) {
		const inner = errors.find((e): e is { code: string } => typeof (e as { code?: unknown })?.code === "string");
		if (inner) return inner.code;
	}
	return undefined;
}

/** Failures that happen before a request reaches the server, so retrying cannot apply it twice, whatever the method. */
const NEVER_SENT = new Set([
	"UND_ERR_CONNECT_TIMEOUT",
	"ENOTFOUND",
	"EAI_AGAIN",
	"ECONNREFUSED",
	"ENETUNREACH",
	"EHOSTUNREACH",
]);

/** Failures after the connection was made, where the server may or may not have seen the request. */
const DROPPED = new Set(["ECONNRESET", "EPIPE", "UND_ERR_SOCKET", "ETIMEDOUT"]);

/**
 * Whether a failed request is worth sending again: always when it never left, and for a read when the connection
 * dropped (a repeat read changes nothing). A write that may have arrived is never repeated.
 */
export function worthRetrying(code: string | undefined, method: string): boolean {
	if (!code) return false;
	if (NEVER_SENT.has(code)) return true;
	return DROPPED.has(code) && (method === "GET" || method === "HEAD");
}
