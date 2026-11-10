import { describe, expect, it } from "vitest";

import { errorsEnvKeys } from "./errors-env-keys.js";

describe("errorsEnvKeys", () => {
	const described = { envKeys: ["SENTRY_DSN"], frameworkEnvKeys: { next: ["NEXT_PUBLIC_SENTRY_DSN"] } };

	it("adds a framework's keys when the stack has it", () => {
		expect(errorsEnvKeys(described, ["vite", "next"]).keys).toEqual(["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]);
	});

	it("keeps only envKeys when the stack lacks the framework", () => {
		expect(errorsEnvKeys(described, ["vite"]).keys).toEqual(["SENTRY_DSN"]);
	});

	it("ignores a provider that has no frameworkEnvKeys", () => {
		expect(errorsEnvKeys({ envKeys: ["SENTRY_DSN"] }, ["next"]).keys).toEqual(["SENTRY_DSN"]);
	});

	it("pushes a repeated key once", () => {
		expect(errorsEnvKeys({ envKeys: ["A"], frameworkEnvKeys: { next: ["A", "B"] } }, ["next"]).keys).toEqual([
			"A",
			"B",
		]);
	});

	it("reports a framework name that is not a known stack name, and pushes none of its keys", () => {
		const result = errorsEnvKeys({ envKeys: ["SENTRY_DSN"], frameworkEnvKeys: { nxt: ["X"], next: ["Y"] } }, [
			"next",
		]);
		expect(result).toEqual({ keys: ["SENTRY_DSN", "Y"], unknown: ["nxt"] });
	});

	it("reports nothing unknown for the known names", () => {
		expect(errorsEnvKeys(described, []).unknown).toEqual([]);
	});
});
