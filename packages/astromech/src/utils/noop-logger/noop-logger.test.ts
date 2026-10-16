import { describe, expect, it } from "vitest";

import { noopLogger } from "./noop-logger.js";

describe("noopLogger", () => {
	it("accepts debug and warn records without throwing or returning anything", () => {
		expect(noopLogger.debug({ a: 1 }, "msg")).toBeUndefined();
		expect(noopLogger.warn({ a: 1 })).toBeUndefined();
	});
});
