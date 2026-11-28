import { describe, expect, it } from "vitest";

import { appLayer } from "./app-layer.js";

describe("appLayer", () => {
	it("reads production from prod", () => {
		expect(appLayer("production")).toBe("prod");
	});

	it("reads preview from its own layer, never prod", () => {
		expect(appLayer("preview")).toBe("preview");
	});
});
