import { createHash, timingSafeEqual } from "node:crypto";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Whether a cron call carries the project's `CRON_SECRET`: Vercel sends `Authorization: Bearer <secret>`. Both sides are
 * hashed first so the comparison is constant-time whatever the lengths. A missing or malformed header, or an empty
 * secret, is never authorized.
 *
 * @param header - The request's `Authorization` header, or `null`.
 * @param secret - The configured `CRON_SECRET`.
 */
export function isCronAuthorized(header: string | null, secret: string): boolean {
	if (secret === "" || !header?.startsWith("Bearer ")) return false;
	return timingSafeEqual(digest(header.slice("Bearer ".length)), digest(secret));
}
