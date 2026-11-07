import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createLinearClient } from "./rest.js";

/** Options for {@link verifyToken}. */
export interface VerifyTokenOptions {
	/** Overrides the API root, for tests. */
	baseUrl?: string;
	/** Overrides `fetch`, for tests. */
	fetch?: typeof fetch;
}

/** Checks a Linear token by reading the viewer; the success subject names the user and workspace. */
export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createLinearClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const { user, organization } = await client.teams.viewer();
		return { ok: true, subject: `${user.displayName} @ ${organization.name}` };
	} catch (err) {
		return { ok: false, message: errorMessage(err) };
	}
}
