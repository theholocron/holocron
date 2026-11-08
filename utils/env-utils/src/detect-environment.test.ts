import { describe, expect, it } from "vitest";

import { detectEnvironment } from "./detect-environment.js";
import { ENVIRONMENTS } from "./environment.js";

describe("detectEnvironment", () => {
	it("is ci inside CI and local anywhere else when ENVIRONMENT says nothing", () => {
		expect(detectEnvironment({ CI: "true" })).toBe("ci");
		expect(detectEnvironment({})).toBe("local");
		expect(detectEnvironment({ ENVIRONMENT: "" })).toBe("local");
		expect(detectEnvironment({ ENVIRONMENT: "somewhere-else", CI: "true" })).toBe("ci");
	});

	it.each(ENVIRONMENTS)("takes %s from ENVIRONMENT", (name) => {
		expect(detectEnvironment({ ENVIRONMENT: name })).toBe(name);
	});

	it("lets ENVIRONMENT win over CI, so a deploy job in CI can say it is prod", () => {
		expect(detectEnvironment({ ENVIRONMENT: "prod", CI: "true" })).toBe("production");
	});

	it("reads HOLOCRON_ENVIRONMENT first and keeps ENVIRONMENT as the fallback", () => {
		expect(detectEnvironment({ HOLOCRON_ENVIRONMENT: "production" })).toBe("production");
		expect(detectEnvironment({ HOLOCRON_ENVIRONMENT: "test", ENVIRONMENT: "production" })).toBe("test");
		expect(detectEnvironment({ HOLOCRON_ENVIRONMENT: "", ENVIRONMENT: "production" })).toBe("production");
	});

	it("reads the usual spellings, in any case", () => {
		expect(detectEnvironment({ ENVIRONMENT: "Production" })).toBe("production");
		expect(detectEnvironment({ ENVIRONMENT: " DEVELOPMENT " })).toBe("development");
		expect(detectEnvironment({ ENVIRONMENT: "staging" })).toBe("test");
		expect(detectEnvironment({ ENVIRONMENT: "qa" })).toBe("test");
	});

	it("ignores ENV and NODE_ENV, which tools set for their own reasons", () => {
		expect(detectEnvironment({ NODE_ENV: "production", ENV: "prod" })).toBe("local");
	});

	it("reads process.env when no environment is given", () => {
		const saved = process.env["ENVIRONMENT"];
		process.env["ENVIRONMENT"] = "test";
		try {
			expect(detectEnvironment()).toBe("test");
		} finally {
			if (saved === undefined) delete process.env["ENVIRONMENT"];
			else process.env["ENVIRONMENT"] = saved;
		}
	});
});
