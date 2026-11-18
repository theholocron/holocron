import { describe, expect, it } from "vitest";

import { describeGraphQLErrors } from "./describe-graphql-errors.js";

describe("describeGraphQLErrors", () => {
	it("prints a message repeated hundreds of times once", () => {
		const errors = Array.from({ length: 200 }, () => ({ message: "Resource limits for this query exceeded." }));
		const summary = describeGraphQLErrors(errors);
		expect(summary.text).toBe("Resource limits for this query exceeded.");
		expect(summary.distinct).toHaveLength(1);
	});

	it("adds the type and the path when present, and keeps entries that differ by either", () => {
		const summary = describeGraphQLErrors([
			{ message: "Boom", type: "NOT_FOUND", path: ["node", "items", 0] },
			{ message: "Boom", type: "NOT_FOUND", path: ["node", "items", 1] },
			{ message: "Boom", type: "NOT_FOUND", path: ["node", "items", 0] },
			{ message: "Boom", path: [] },
			{ message: "Slow", type: "TIMEOUT" },
		]);
		expect(summary.text).toBe(
			"Boom [NOT_FOUND, node.items.0]; Boom [NOT_FOUND, node.items.1]; Boom; Slow [TIMEOUT]"
		);
		expect(summary.distinct).toHaveLength(4);
	});
});
