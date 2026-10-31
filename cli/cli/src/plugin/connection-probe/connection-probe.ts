import { lookup as dnsLookup } from "node:dns/promises";

import type { VerifyTokenResult } from "../../commands/auth/auth.type.js";
import type { Probe } from "../probe/index.js";

/** What a connection probe needs to check a provider's host and token. */
export interface ConnectionProbeInput {
	/** How the provider is named in output, e.g. `Axiom`. */
	provider: string;
	/** A URL on the provider's API host. Without one, only the token is checked (a provider that has no HTTP API of its own). */
	url?: string;
	/** Finds the token the plugin would use. Throws with a message that says where to put one when there is none. */
	token: () => string | Promise<string>;
	/** The plugin's `verifyToken`: asks the provider who the token belongs to. */
	verify: (token: string) => Promise<VerifyTokenResult>;
	/** Stands in for the network, so with one the name lookup (which cannot be stood in for) is not made. */
	fetch?: typeof fetch;
	/** Resolves a hostname. Defaults to the system resolver, unless `fetch` is given. */
	lookup?: (host: string) => Promise<{ address: string }>;
	/** Longest to wait for the host to answer. Defaults to 10 s. */
	timeoutMs?: number;
}

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

/** A network failure in plain words, with what usually causes it. Never includes anything from a request. */
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

/**
 * The `connection` probe every provider offers, for telling a network problem from a credential problem: does the name
 * resolve, does the host answer, is there a token, and does the provider accept it. A step that cannot work because an
 * earlier one failed is reported as not tried rather than failing a second time for the same reason.
 */
export function connectionProbe(input: ConnectionProbeInput): Probe {
	const timeoutMs = input.timeoutMs ?? 10_000;
	return {
		summary: `Check the network path to ${input.provider} and that it accepts your token.`,
		writes: false,
		async run(probe) {
			let reachable = true;
			if (input.url) {
				const host = new URL(input.url).hostname;
				const lookup = input.lookup ?? (input.fetch ? undefined : (h: string) => dnsLookup(h));
				if (lookup) {
					try {
						const { address } = await lookup(host);
						probe.say({ status: "ok", label: `DNS ${host}`, detail: address });
					} catch (err) {
						reachable = false;
						probe.say({
							status: "fail",
							label: `DNS ${host}`,
							detail: describeNetworkError(err, timeoutMs),
						});
					}
				}
				if (reachable) {
					const started = Date.now();
					try {
						const res = await (input.fetch ?? fetch)(input.url, {
							method: "GET",
							signal: AbortSignal.timeout(timeoutMs),
						});
						// Any answer proves the path works; a 401 or 404 here is the host talking, not a fault.
						probe.say({
							status: "ok",
							label: `reach ${host}`,
							detail: `HTTP ${res.status} in ${Date.now() - started} ms`,
						});
					} catch (err) {
						reachable = false;
						probe.say({
							status: "fail",
							label: `reach ${host}`,
							detail: describeNetworkError(err, timeoutMs),
						});
					}
				} else {
					probe.say({
						status: "info",
						label: `reach ${host}`,
						detail: "not tried: the name did not resolve",
					});
				}
			}

			let token: string;
			try {
				token = await input.token();
			} catch (err) {
				probe.say({ status: "fail", label: "token", detail: (err as Error).message });
				probe.say({ status: "info", label: "accepted", detail: "not tried: there is no token" });
				return;
			}
			probe.secret(token);
			probe.say({ status: "ok", label: "token", detail: "found" });

			if (!reachable) {
				probe.say({ status: "info", label: "accepted", detail: "not tried: the host could not be reached" });
				return;
			}
			const result = await input.verify(token);
			probe.say(
				result.ok
					? { status: "ok", label: "accepted", detail: result.subject }
					: { status: "fail", label: "accepted", detail: result.message }
			);
		},
	};
}
