import { describe, expect, it } from "vitest";

import { DOCTOR_ENVIRONMENTS, parseEnvList } from "./parse-env-list.js";

const thrown = (fn: () => unknown): Error | undefined => {
	try {
		fn();
	} catch (e) {
		return e as Error;
	}
};

describe("parseEnvList", () => {
	it("returns undefined when --env was not given or is empty", () => {
		expect(parseEnvList(undefined)).toBeUndefined();
		expect(parseEnvList([])).toBeUndefined();
	});

	it("takes one name, a comma-separated list and repeated values alike", () => {
		expect(parseEnvList(["ci"])).toEqual(["ci"]);
		expect(parseEnvList(["local,dev"])).toEqual(["local", "dev"]);
		expect(parseEnvList(["local", "dev"])).toEqual(["local", "dev"]);
		expect(parseEnvList(["local, dev", "prod"])).toEqual(["local", "dev", "prod"]);
	});

	it("collapses duplicates and returns the canonical order whatever was typed", () => {
		expect(parseEnvList(["prod,ci", "ci", "local,prod"])).toEqual(["local", "ci", "prod"]);
		expect(parseEnvList(["prod,test,ci,dev,local"])).toEqual([...DOCTOR_ENVIRONMENTS]);
	});

	it("rejects an unknown name and lists the allowed ones", () => {
		const err = thrown(() => parseEnvList(["ci,staging,qa"]));
		expect(err?.name).toBe("ConfigError");
		expect(err?.message).toContain('"staging", "qa"');
		expect(err?.message).toContain("local, dev, ci, test, prod");
	});

	it("rejects an empty name, such as a trailing comma", () => {
		expect(thrown(() => parseEnvList(["ci,"]))?.message).toContain("(empty)");
	});
});
