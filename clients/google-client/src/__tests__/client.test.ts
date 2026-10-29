import { describe, expect, it } from "vitest";

import { google } from "../index.js";

describe("google client shape", () => {
	it("exports a google object with documents and spreadsheets namespaces", () => {
		expect(typeof google.documents).toBe("object");
		expect(typeof google.spreadsheets).toBe("object");
	});

	it("documents has a get method", () => {
		expect(typeof google.documents.get).toBe("function");
	});

	it("spreadsheets has a get method", () => {
		expect(typeof google.spreadsheets.get).toBe("function");
	});
});
