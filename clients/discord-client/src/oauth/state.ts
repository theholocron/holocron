import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function mac(secret: string, message: string): string {
	return createHmac("sha256", secret).update(message).digest("hex");
}

/** How long a sign-in link stays valid by default, in seconds. */
export const DEFAULT_STATE_TTL_SECONDS = 600;

/**
 * An OAuth `state` that a stateless server can check without storing anything: a random nonce and an
 * expiry, signed with a server-side secret. Tampering with either, or using a different secret, fails
 * {@link verifyOAuthState}. It does not bind the link to one browser: set the nonce in a cookie as well
 * when that matters.
 */
export function signOAuthState(secret: string, opts: { now?: number; ttlSeconds?: number } = {}): string {
	const expires = Math.floor((opts.now ?? Date.now()) / 1000) + (opts.ttlSeconds ?? DEFAULT_STATE_TTL_SECONDS);
	const body = `${expires}.${randomBytes(16).toString("hex")}`;
	return `${body}.${mac(secret, body)}`;
}

/** Whether `state` was signed with `secret` and has not expired. Never throws on malformed input. */
export function verifyOAuthState(secret: string, state: string, opts: { now?: number } = {}): boolean {
	const parts = state.split(".");
	if (parts.length !== 3) return false;
	const [expires, nonce, sig] = parts as [string, string, string];
	if (!/^\d+$/.test(expires) || !/^[0-9a-f]{32}$/.test(nonce)) return false;
	const want = Buffer.from(mac(secret, `${expires}.${nonce}`));
	const got = Buffer.from(sig);
	if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
	return Number(expires) >= Math.floor((opts.now ?? Date.now()) / 1000);
}
