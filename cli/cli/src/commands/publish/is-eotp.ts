import type { NpmTrustError } from "./run-sync-trust/index.js";

export function isEotp(parsed: unknown): boolean {
	return (
		typeof parsed === "object" &&
		parsed !== null &&
		"error" in parsed &&
		(parsed as NpmTrustError).error?.code === "EOTP"
	);
}
