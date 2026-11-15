import { owners } from "./owners/owners.js";
import { repos } from "./repos/repos.js";
import { type CodecovClientOptions, createCodecovRestClient } from "./utils.js";

export type { CodecovOwner } from "./owners/owners.js";
export type { CodecovRepo, CodecovService } from "./repos/repos.js";
export type { CodecovClientOptions } from "./utils.js";

/** Creates a Codecov API client with `owners` and `repos` groups, both sharing one REST client. */
export function createCodecovClient(opts: CodecovClientOptions) {
	const rest = createCodecovRestClient(opts);
	return {
		owners: owners(rest),
		repos: repos(rest),
	};
}

/** The client `createCodecovClient` returns. */
export type CodecovClient = ReturnType<typeof createCodecovClient>;
