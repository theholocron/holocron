import { describeError } from "@theholocron/kyber/ui";

import { ProviderApiError } from "../../plugin/index.js";

/**
 * The text of a failed incident write. A transport failure (status 0: a timeout, a dropped connection) leaves it unknown
 * whether the provider took the write, so that text says so and names where to look, and a rerun is not advised blindly.
 */
export function incidentWriteFailure(what: string, err: unknown): string {
	const text = `${what}: ${describeError(err)}`;
	if (err instanceof ProviderApiError && err.status === 0) {
		return `${text}. It may or may not have been written: check the status page before running it again`;
	}
	return text;
}
