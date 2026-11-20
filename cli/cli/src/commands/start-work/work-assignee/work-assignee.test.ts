import { describe, expect, it } from "vitest";

import { workAssignee } from "./work-assignee.js";

describe("workAssignee", () => {
	it("is undefined with no assignee", () => {
		expect(workAssignee(null, "github", "github")).toBeUndefined();
		expect(workAssignee(undefined, "github", "github")).toBeUndefined();
	});

	it("uses a mapped login first", () => {
		expect(workAssignee({ id: "u1", displayName: "x", login: "octo" }, "linear", "github")).toBe("octo");
	});

	it("uses the id when the issue and the pull request are in the same tracker", () => {
		expect(workAssignee({ id: "iamnewton", displayName: "Newton" }, "github", "github")).toBe("iamnewton");
	});

	it("leaves a user from another tracker with no mapping unassigned", () => {
		expect(workAssignee({ id: "u1", displayName: "x" }, "linear", "github")).toBeUndefined();
	});
});
