import { checks } from "./checks/checks.js";
import { type ChecklyClientOptions, createChecklyRestClient } from "./utils.js";

export type {
	ApiCheck,
	ApiCheckInput,
	ApiCheckRequest,
	Assertion,
	AssertionComparison,
	AssertionSource,
	HttpMethod,
	ListChecksParams,
} from "./checks/checks.js";
export type { ChecklyClientOptions } from "./utils.js";

export function createChecklyClient(opts: ChecklyClientOptions) {
	const rest = createChecklyRestClient(opts);
	return {
		checks: checks(rest),
	};
}

export type ChecklyClient = ReturnType<typeof createChecklyClient>;
