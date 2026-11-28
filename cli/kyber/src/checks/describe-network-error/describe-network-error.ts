const TLS_CODES = new Set([
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
	"SELF_SIGNED_CERT_IN_CHAIN",
	"DEPTH_ZERO_SELF_SIGNED_CERT",
	"CERT_HAS_EXPIRED",
	"UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
	"ERR_TLS_CERT_ALTNAME_INVALID",
]);

/** The code Node attaches to a network failure, with that error's message: on the error itself, or on its `cause` (where `fetch` puts it). */
function codeOf(err: unknown): { code: string; message: string } | undefined {
	for (
		let e = err as { code?: unknown; message?: unknown; cause?: unknown } | undefined, depth = 0;
		e && depth < 4;
		depth++
	) {
		if (typeof e.code === "string") return { code: e.code, message: String(e.message ?? "") };
		e = e.cause as typeof e;
	}
	return undefined;
}

/**
 * A network failure in plain words, with what usually causes it. Never includes anything from a request.
 *
 * @param err - The error `fetch` or a name lookup threw; Node's error code is read from it or from its `cause`.
 * @param timeoutMs - The deadline that was set, for the "no answer within" message.
 * @returns One line for a person: the code and what usually causes it.
 */
export function describeNetworkError(err: unknown, timeoutMs: number): string {
	const found = codeOf(err);
	const code = found?.code;
	const name = (err as { name?: string } | undefined)?.name;
	if (
		name === "TimeoutError" ||
		name === "AbortError" ||
		code === "UND_ERR_CONNECT_TIMEOUT" ||
		code === "ETIMEDOUT"
	) {
		return `no answer within ${timeoutMs / 1000}s (${code ?? name}): a firewall, VPN or proxy may be dropping it`;
	}
	switch (code) {
		case "ENOTFOUND":
		case "EAI_AGAIN":
			return `${code}: the name did not resolve; check your network and DNS`;
		case "ECONNREFUSED":
			return "ECONNREFUSED: the host refused the connection";
		case "ECONNRESET":
		case "UND_ERR_SOCKET":
			return `${code}: the connection was cut off; a proxy or firewall may be interfering`;
		case "ENETUNREACH":
		case "EHOSTUNREACH":
			return `${code}: no route to the host; check that you are online`;
		default:
			if (code && TLS_CODES.has(code)) {
				return `${code}: the TLS certificate was not trusted; a corporate proxy that re-signs traffic needs NODE_EXTRA_CA_CERTS`;
			}
			return found ? `${found.code}: ${found.message}` : String((err as Error)?.message ?? err);
	}
}
