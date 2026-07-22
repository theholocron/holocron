import { parseKey } from "./parse-key.js";

/**
 * Normalize any key syntax into a path array for traversal.
 *
 *   "service.db.url"   → ["service", "db", "url"]   dot syntax
 *   "service__db__url" → ["service", "db", "url"]   double underscore
 *   "SERVICE__DB__URL" → ["service", "db", "url"]   uppercase double underscore
 *   "SERVICE_DB_URL"   → ["service_db_url"]          flat — single _ preserved
 *   "service_db_url"   → ["service_db_url"]          flat — single _ preserved
 *
 * Dot syntax and double underscores are both traversal — independent of casing.
 * Single underscores always produce a flat key — they are never traversal separators.
 */
export function normalizeKey(key: string): string[] {
	const lower = key.toLowerCase();

	// Dot syntax — always traversal
	if (lower.includes(".")) {
		return lower.split(".").filter(Boolean);
	}

	// Double underscore — traversal via parseKey
	if (lower.includes("__")) {
		return parseKey(lower);
	}

	// Single underscore only — flat key, no traversal
	return [lower];
}
