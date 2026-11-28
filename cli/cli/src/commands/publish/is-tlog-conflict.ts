/**
 * Whether a failed `pnpm publish` was npm's sigstore step answering 409
 * (`TLOG_CREATE_ENTRY_ERROR`, "an equivalent entry already exists in the
 * transparency log"): the only failure class `publish package` retries (#1387).
 * A bare registry `E409` (the version already exists) is not this class; the
 * view check after every failure settles that one.
 */
export function isTlogConflict(output: string): boolean {
	return /TLOG_CREATE_ENTRY_ERROR|equivalent entry already exists in the transparency log/i.test(output);
}
