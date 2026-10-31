import type { TokenExpiry } from "./token-expiry.type.js";

/** A token with this many days or fewer left fails `holocron doctor tokens`, so there is time to renew it. */
export const TOKEN_EXPIRY_WARN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a token has left, as `expires in 12 days`, and whether that is inside the warning window.
 * A time that cannot be read is reported as no expiry rather than guessed at.
 */
export function describeExpiry(expiresAt: string, now: Date): TokenExpiry | undefined {
	const left = Date.parse(expiresAt) - now.getTime();
	if (Number.isNaN(left)) return undefined;
	const soon = left <= TOKEN_EXPIRY_WARN_DAYS * DAY_MS;
	const days = Math.floor(left / DAY_MS);
	if (left <= 0) return { text: "expired", soon };
	if (days < 1) return { text: "expires in less than a day", soon };
	return { text: `expires in ${days} ${days === 1 ? "day" : "days"}`, soon };
}
