import { describe, expect, it } from "vitest";

import { createConfig } from "./create-config.js";

describe("codecov createConfig", () => {
	it("includes standard coverage thresholds and comment layout", () => {
		const out = createConfig([]);
		expect(out).toContain("require_ci_to_pass: true");
		expect(out).toContain("target: auto");
		expect(out).toContain("target: 80%");
		expect(out).toContain('layout: "reach,diff,flags,components"');
		expect(out).toContain("require_changes: true");
	});

	it("includes the scaffold header", () => {
		expect(createConfig([])).toContain("Scaffolded by holocron setup");
	});

	it("produces individual_components entry for each package using slug as name", () => {
		const out = createConfig([
			{ slug: "http-client", name: "@theholocron/http-client" },
			{ slug: "clerk-client", name: "@theholocron/clerk-client" },
		]);
		expect(out).toContain("component_id: http-client");
		expect(out).toContain('name: "http-client"');
		expect(out).not.toContain("@theholocron/");
		expect(out).toContain("component_id: clerk-client");
	});

	it("produces empty individual_components list when no packages are given", () => {
		const out = createConfig([]);
		expect(out).toContain("individual_components:");
		expect(out).toContain("[]");
	});

	it("ends with a trailing newline", () => {
		expect(createConfig([])).toMatch(/\n$/);
	});
});
