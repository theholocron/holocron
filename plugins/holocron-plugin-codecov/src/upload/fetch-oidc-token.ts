/** What {@link fetchOidcToken} takes. */
export interface FetchOidcTokenInput {
	/** `ACTIONS_ID_TOKEN_REQUEST_URL`. */
	requestUrl: string;
	/** `ACTIONS_ID_TOKEN_REQUEST_TOKEN`, the bearer for the request. */
	requestToken: string;
	/** `fetch`. */
	fetch: typeof fetch;
}

/** The audience Codecov takes an OIDC token for. */
export const CODECOV_OIDC_AUDIENCE = "https://codecov.io";

/**
 * Asks the Actions runtime for a job OIDC token for Codecov. The token lives about five minutes, so a caller fetches a
 * new one before every upload and masks it in the log before anything else sees it. Throws, without the token or the
 * bearer, when the request fails or answers no value.
 */
export async function fetchOidcToken(input: FetchOidcTokenInput): Promise<string> {
	const url = `${input.requestUrl}${input.requestUrl.includes("?") ? "&" : "?"}audience=${CODECOV_OIDC_AUDIENCE}`;
	const res = await input.fetch(url, { headers: { authorization: `bearer ${input.requestToken}` } });
	if (!res.ok) throw new Error(`could not get an OIDC token: the Actions runtime answered ${res.status}`);
	const body = (await res.json().catch(() => undefined)) as { value?: unknown } | undefined;
	const value = body?.value;
	if (typeof value !== "string" || value === "")
		throw new Error("could not get an OIDC token: the answer had no value");
	return value;
}
