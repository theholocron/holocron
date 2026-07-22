import { describe, expect, it } from "vitest";
import { buildEnvObject } from "./index.js";

describe("buildEnvObject", () => {
	it("builds a flat object from simple keys", () => {
		const result = buildEnvObject(
			{ ALLM_SERVICE_URL: "http://localhost" },
			true,
		);
		expect(result).toEqual({ allm_service_url: "http://localhost" });
	});

	it("builds a nested object from double-underscore keys", () => {
		const result = buildEnvObject(
			{ ALLM__SERVICE__URL: "http://localhost" },
			true,
		);
		expect(result).toEqual({
			allm: { service: { url: "http://localhost" } },
		});
	});

	it("coerces values when parseValues is true", () => {
		const result = buildEnvObject({ PORT: "3000", DEBUG: "true" }, true);
		expect(result).toEqual({ port: 3000, debug: true });
	});

	it("skips undefined values", () => {
		const result = buildEnvObject(
			{ DEFINED: "yes", MISSING: undefined },
			false,
		);
		expect(result).toEqual({ defined: "yes" });
	});

	it("throws on scalar-to-namespace collision", () => {
		expect(() =>
			buildEnvObject({ FOO: "scalar", FOO__BAR: "nested" }, false),
		).toThrow(/Key collision/);
	});

	it("merges multiple keys into the same nested namespace", () => {
		const result = buildEnvObject(
			{ DB__HOST: "localhost", DB__PORT: "5432", DB__NAME: "mydb" },
			true,
		);
		expect(result).toEqual({
			db: { host: "localhost", port: 5432, name: "mydb" },
		});
	});
});
