import { describe, expect, it } from "vitest";

import { entry } from "../__tests__/fixtures.js";
import { createCommandRegistry } from "./create-command-registry.js";

describe("createCommandRegistry", () => {
	it("keeps the entries in the order given", () => {
		const entries = [entry("doctor"), entry("auth set")];
		expect(createCommandRegistry(entries).entries.map((e) => e.name)).toEqual(["doctor", "auth set"]);
	});

	it("looks an entry up by its full name", () => {
		const auth = entry("auth set");
		expect(createCommandRegistry([entry("doctor"), auth]).getEntry("auth set")).toBe(auth);
	});

	it("throws for an unknown name, naming the catalog", () => {
		expect(() => createCommandRegistry([entry("doctor")], "tool").getEntry("nope")).toThrow(
			'tool: no command registry entry named "nope"'
		);
	});

	it("throws for a repeated name when the catalog is built", () => {
		expect(() => createCommandRegistry([entry("doctor"), entry("doctor")])).toThrow(/duplicate/);
	});
});
