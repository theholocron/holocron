import { describe, expect, it } from "vitest";

import { type Logger, NoopLogger } from "./logger.js";

describe("NoopLogger", () => {
	it("every level method is a silent no-op, string or object+msg form alike", () => {
		const log: Logger = new NoopLogger();
		expect(log.debug("msg")).toBeUndefined();
		expect(log.info({ repo: "holocron" }, "msg")).toBeUndefined();
		expect(log.warn({ repo: "holocron" })).toBeUndefined();
		expect(log.error("msg")).toBeUndefined();
	});

	it("child() returns the same instance — a whole tree collapses to one", () => {
		const log = new NoopLogger();
		const child = log.child({ module: "sync" });
		expect(child).toBe(log);
		expect(child.child({ repo: "holocron" })).toBe(log);
	});
});
