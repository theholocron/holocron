import type { NpmTrustError } from "./run-sync-trust/run-sync-trust.type.js";

export function isEotp(parsed: unknown): boolean {
	return (
		typeof parsed === "object" &&
		parsed !== null &&
		"error" in parsed &&
		(parsed as NpmTrustError).error?.code === "EOTP"
	);
}
