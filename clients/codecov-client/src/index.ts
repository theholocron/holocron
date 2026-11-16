import { components } from "./components/components.js";
import { flags } from "./flags/flags.js";
import { owners } from "./owners/owners.js";
import { repos } from "./repos/repos.js";
import { type CodecovClientOptions, createCodecovRestClient } from "./utils.js";

export type { CodecovComponent } from "./components/components.js";
export type { CodecovFlag } from "./flags/flags.js";
export type { CodecovOwner } from "./owners/owners.js";
export type { CodecovRepo, CodecovService } from "./repos/repos.js";
export type { CodecovClientOptions } from "./utils.js";

/** Creates a Codecov API client with `components`, `flags`, `owners` and `repos` groups, all sharing one REST client. */
export function createCodecovClient(opts: CodecovClientOptions) {
	const rest = createCodecovRestClient(opts);
	return {
		components: components(rest),
		flags: flags(rest),
		owners: owners(rest),
		repos: repos(rest),
	};
}

/** The client `createCodecovClient` returns. */
export type CodecovClient = ReturnType<typeof createCodecovClient>;
