import { ProviderApiError } from "../../../plugin/index.js";

/** What a failed Type call means: a refusal of the token, a rate limit, a name that already exists, or anything else. */
export type TypeErrorKind = "refused" | "rate-limit" | "conflict" | "other";

/** Reads a thrown error as one of the four things `ensureIssueTypes()` acts on differently. */
export function classifyTypeError(err: unknown): TypeErrorKind {
	if (!(err instanceof ProviderApiError)) return "other";
	if (err.status === 429 || (err.status === 403 && /rate limit/i.test(`${err.message} ${String(err.details)}`))) {
		return "rate-limit";
	}
	if (err.status === 401 || err.status === 403) return "refused";
	if (err.status === 409 || err.status === 422) return "conflict";
	return "other";
}
