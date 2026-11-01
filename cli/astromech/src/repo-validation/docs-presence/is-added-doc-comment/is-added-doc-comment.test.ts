import { describe, expect, it } from "vitest";

import { isAddedDocComment } from "./is-added-doc-comment.js";

describe("isAddedDocComment", () => {
	it("matches added doc comment lines only", () => {
		expect(isAddedDocComment("+/** One line. */")).toBe(true);
		expect(isAddedDocComment("+\t * @remarks Long.")).toBe(true);
		expect(isAddedDocComment("+\t */")).toBe(true);
		expect(isAddedDocComment("+const x = 1;")).toBe(false);
		expect(isAddedDocComment("-/** removed */")).toBe(false);
		expect(isAddedDocComment("+// a line comment")).toBe(false);
	});
});
