import { describe, expect, it } from "vitest";

import { parseAppEnv } from "./app-env.js";

describe("parseAppEnv", () => {
	it.each(["production", "prod", "Production"])("reads %s as production", (value) => {
		expect(parseAppEnv(value)).toEqual({ targets: ["production"] });
	});

	it("reads preview", () => {
		expect(parseAppEnv(["preview"])).toEqual({ targets: ["preview"] });
	});

	it("takes several, production first whatever the order, and drops repeats", () => {
		expect(parseAppEnv(["preview", "prod", "production"])).toEqual({ targets: ["production", "preview"] });
	});

	it.each([undefined, "", [], [""]])("asks for a value when it is %j", (value) => {
		expect(() => parseAppEnv(value)).toThrow(/pass --env production or --env preview/);
	});

	it.each(["local", "dev", "development", "ci"])("refuses %s with the reason", (value) => {
		expect(() => parseAppEnv(value)).toThrow(/not an environment an app is deployed or synced to/);
	});

	it("refuses test, which has no deployment target, and the whole list with it", () => {
		expect(() => parseAppEnv(["production", "staging"])).toThrow(/--env staging is not an environment an app/);
	});

	it("refuses an unknown word, and so no longer all", () => {
		expect(() => parseAppEnv("nope")).toThrow(/unknown --env "nope" \(accepted: production, preview\)/);
		expect(() => parseAppEnv("all")).toThrow(/unknown --env "all"/);
	});
});
