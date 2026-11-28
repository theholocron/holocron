import type { FetchLatest } from "@theholocron/pkg-utils";

const FETCH_TIMEOUT_MS = 4000;

/**
 * Resolve a package's `latest` dist-tag from the npm registry.
 *
 * Never throws: a network failure, timeout, or non-2xx response resolves to `null`.
 */
export const fetchLatestFromNpm: FetchLatest = async (pkg) => {
	try {
		const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { accept: "application/vnd.npm.install-v1+json" },
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { "dist-tags"?: Record<string, string> };
		return data["dist-tags"]?.["latest"] ?? null;
	} catch {
		return null;
	}
};
