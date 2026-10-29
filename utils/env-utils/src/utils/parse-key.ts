/**
 * Split a raw env key into a path array using the __ / _ convention:
 *
 *   ALLM_SERVICE_URL   → ["allm_service_url"]           (flat, _ preserved)
 *   ALLM__SERVICE__URL → ["allm", "service", "url"]     (nested, __ = dot)
 *
 * Strategy: replace __ with a NUL sentinel first, split on NUL, then
 * restore any remaining _ in each segment. This means a single _ anywhere
 * inside a segment survives untouched.
 */
export function parseKey(rawKey: string): string[] {
	const SENTINEL = "\u0000";
	const lower = rawKey.toLowerCase();

	if (!lower.includes("__")) {
		return [lower];
	}

	return lower.replaceAll("__", SENTINEL).split(SENTINEL).filter(Boolean);
}
