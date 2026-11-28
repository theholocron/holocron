/* v8 ignore file -- test fixtures */
import { stubFetch } from "@theholocron/http-client/testing";

export { stubFetch };

/** A GraphQL answer carrying `data`. */
export const data = (d: unknown) => ({ body: { data: d } });

/** One page of a connection. */
export const page = <T>(nodes: T[], endCursor: string | null = null) => ({
	nodes,
	pageInfo: { hasNextPage: endCursor !== null, endCursor },
});
