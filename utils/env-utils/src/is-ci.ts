/**
 * Whether the process is running inside CI. GitHub Actions and most other providers set `CI=true`; any other non-empty
 * value counts too, except `false` and `0`.
 *
 * @example
 * isCI({ CI: "true" }); // true
 * isCI({ CI: "false" }); // false
 */
export function isCI(env: Record<string, string | undefined> = process.env): boolean {
	const ci = env["CI"];
	if (!ci) return false;
	return ci !== "false" && ci !== "0";
}
