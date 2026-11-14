import { describe, expect, it, vi } from "vitest";

vi.mock("@usebruno/converters", () => ({
	postmanToBruno: vi.fn(async () => ({
		collection: { name: "Demo" },
		issues: ["plain text", { message: "an object with a message" }, { other: 1 }],
	})),
	postmanToBrunoEnvironment: vi.fn(),
}));
vi.mock("@opencollection/converters", () => ({ brunoToOpenCollection: (c: unknown) => c }));

import { convertCollection } from "./convert-collection.js";

describe("convertCollection issues", () => {
	it("makes one line of each issue, whatever shape the converter gave it", async () => {
		const { issues } = await convertCollection({}, []);
		expect(issues).toEqual(["plain text", "an object with a message", '{"other":1}']);
	});
});
