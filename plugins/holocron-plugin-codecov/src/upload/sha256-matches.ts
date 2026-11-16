import { createHash } from "node:crypto";

/** Whether the SHA-256 digest of `bytes` equals `expected` (hex, any case). */
export function sha256Matches(bytes: Uint8Array, expected: string): boolean {
	return createHash("sha256").update(bytes).digest("hex") === expected.trim().toLowerCase();
}
