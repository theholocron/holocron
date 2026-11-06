import { lookup as dnsLookup } from "node:dns/promises";

import { describeNetworkError } from "../describe-network-error/index.js";
import type { ConnectionProbe, ConnectionProbeInput } from "./connection-probe.type.js";

/**
 * The `connection` probe every provider offers, for telling a network problem from a credential problem: does the name
 * resolve, does the host answer, is there a token, and does the provider accept it. A step that cannot work because an
 * earlier one failed is reported as not tried rather than failing a second time for the same reason.
 *
 * @param input - The provider, its API URL, how to find and verify its token, and test seams for the network.
 * @returns A probe in the shape a plugin system expects: `summary`, `writes: false` and `run(ctx)`, which reports through `ctx.say`.
 */
export function connectionProbe(input: ConnectionProbeInput): ConnectionProbe {
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
