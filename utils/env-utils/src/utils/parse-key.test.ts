import { describe, expect, it } from "vitest";
import { parseKey } from "./index.js";

describe("parseKey", () => {
	it("preserves single underscores as part of the key name", () => {
		expect(parseKey("ALLM_SERVICE_URL")).toEqual(["allm_service_url"]);
	});

	it("splits on double underscores into a nested path", () => {
		expect(parseKey("ALLM__SERVICE__URL")).toEqual([
			"allm",
			"service",
			"url",
		]);
	});

	it("handles mixed single and double underscores", () => {
		expect(parseKey("ALLM__SERVICE_NAME")).toEqual([
			"allm",
			"service_name",
		]);
	});

	it("lowercases all segments", () => {
		expect(parseKey("MY__KEY__NAME")).toEqual(["my", "key", "name"]);
	});

	it("handles a single segment with no underscores", () => {
		expect(parseKey("PORT")).toEqual(["port"]);
	});
});
