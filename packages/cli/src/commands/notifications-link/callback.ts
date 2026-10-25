/**
 * Where a member's browser is sent back to after approving the sign-in: Sentinel when it is up and serves the
 * link route, otherwise a one-shot listener on this machine. Which one is decided by asking, so the same
 * command keeps working whichever way it is deployed, and moving to the hosted one is nothing to reconfigure.
 */

import type { CallbackChoice } from "./notifications-link.type.js";

export const DEFAULT_LOCAL_PORT = 53682;

export const localRedirectUri = (port: number): string => `http://localhost:${port}/callback`;

/**
 * The hosted service answers `GET <hostedUrl>/api/link` with `{ "service": "link" }`. Anything else (a 402 for
 * an exhausted plan, a 404 before the route exists, a timeout) means it cannot serve sign-in now.
 */
export async function resolveCallback(input: {
	hostedUrl?: string;
	port?: number;
	fetch?: typeof fetch;
	timeoutMs?: number;
}): Promise<CallbackChoice> {
	const port = input.port ?? DEFAULT_LOCAL_PORT;
	const local = (reason: string): CallbackChoice => ({ kind: "local", redirectUri: localRedirectUri(port), reason });
	if (!input.hostedUrl) return local("no hosted URL is configured (`layout.links.hostedUrl`)");

	let base = input.hostedUrl;
	// A loop, not a regex: a trailing-slash regex on configuration input is flagged as polynomial.
	while (base.endsWith("/")) base = base.slice(0, -1);
	try {
		const res = await (input.fetch ?? fetch)(`${base}/api/link`, {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(input.timeoutMs ?? 5000),
		});
		if (res.status === 402) return local(`${base} answered 402 (the plan's quota is used up)`);
		if (!res.ok) return local(`${base}/api/link answered ${res.status}`);
		const body = (await res.json().catch(() => ({}))) as { service?: unknown };
		if (body.service !== "link") return local(`${base}/api/link is not the link service`);
		return { kind: "hosted", redirectUri: `${base}/api/link/callback`, reason: `${base} serves sign-in` };
	} catch {
		return local(`${base} did not answer`);
	}
}

/** The portal step, worded for whichever redirect is wanted, for `link` and the doctor to show. */
export function redirectInstruction(redirectUri: string): string {
	return `add ${redirectUri} under OAuth2 → Redirects in the Discord developer portal (the API does not allow setting it)`;
}
