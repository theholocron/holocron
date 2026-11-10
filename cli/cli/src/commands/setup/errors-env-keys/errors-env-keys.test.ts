import { describe, expect, it } from "vitest";

import { errorsEnvKeys } from "./errors-env-keys.js";

describe("errorsEnvKeys", () => {
	const described = { envKeys: ["SENTRY_DSN"], frameworkEnvKeys: { next: ["NEXT_PUBLIC_SENTRY_DSN"] } };

	it("adds a framework's keys when the stack has it", () => {
		expect(errorsEnvKeys(described, ["vite", "next"])).toEqual(["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]);
	});

	it("keeps only envKeys when the stack lacks the framework", () => {
		expect(errorsEnvKeys(described, ["vite"])).toEqual(["SENTRY_DSN"]);
	});

	it("ignores a provider that has no frameworkEnvKeys", () => {
		expect(errorsEnvKeys({ envKeys: ["SENTRY_DSN"] }, ["next"])).toEqual(["SENTRY_DSN"]);
	});

	it("pushes a repeated key once", () => {
		expect(errorsEnvKeys({ envKeys: ["A"], frameworkEnvKeys: { next: ["A", "B"] } }, ["next"])).toEqual(["A", "B"]);
	});
});
