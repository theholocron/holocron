import { describe, expect, it, vi } from "vitest";

vi.mock("@usebruno/converters", () => ({
	postmanToBruno: vi.fn(async () => ({ collection: { name: "Demo" } })),
	postmanToBrunoEnvironment: vi.fn(),
}));
vi.mock("@opencollection/converters", () => ({ brunoToOpenCollection: (c: unknown) => c }));

import { convertCollection } from "./convert-collection.js";

describe("convertCollection with no issues list", () => {
	it("reads a result that has none as no issues", async () => {
		expect((await convertCollection({}, [])).issues).toEqual([]);
	});
});
