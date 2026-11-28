import { describe, expect, it } from "vitest";

import { createRetryNotice } from "./retry-notice.js";
import type { RetryNoticeEvent } from "./retry-notice.type.js";

const hub = () => {
	const handlers = new Set<(e: RetryNoticeEvent) => void>();
	return {
		subscribe: (h: (e: RetryNoticeEvent) => void) => {
			handlers.add(h);
			return () => {
				handlers.delete(h);
			};
		},
		emit: (e: RetryNoticeEvent) => handlers.forEach((h) => h(e)),
	};
};

describe("createRetryNotice", () => {
	it("says on the spinner when a request is being retried, and stops listening when it is unhooked", () => {
		const { subscribe, emit } = hub();
		const texts: string[] = [];
		const unhook = createRetryNotice(subscribe)("source: update settings…", (t) => texts.push(t));
		emit({ vendor: "GitHub", attempt: 2, of: 3 });
		emit({ attempt: 2, of: 3 });
		unhook();
		emit({ vendor: "GitHub", attempt: 2, of: 3 });
		expect(texts).toEqual([
			"source: update settings… (retrying GitHub, attempt 2 of 3)",
			"source: update settings… (retrying the request, attempt 2 of 3)",
		]);
	});
});
