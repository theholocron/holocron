import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveConsoleOutput } from "./resolve-console-output.js";

const saved = process.env["CI"];
beforeEach(() => {
	delete process.env["CI"];
});
afterEach(() => {
	if (saved === undefined) delete process.env["CI"];
	else process.env["CI"] = saved;
});

describe("resolveConsoleOutput", () => {
	it("returns undefined in CI — preserves createLogger's own ci/tty auto-detection", () => {
		process.env.CI = "true";
		expect(resolveConsoleOutput({})).toBeUndefined();
	});

	it("defaults to false outside CI — local/interactive runs are quiet by default", () => {
		delete process.env.CI;
		expect(resolveConsoleOutput({})).toBe(false);
	});

	it("returns true when --log, --verbose, or --quiet was passed, even outside CI", () => {
		delete process.env.CI;
		expect(resolveConsoleOutput({ log: "debug" })).toBe(true);
		expect(resolveConsoleOutput({ verbose: true })).toBe(true);
		expect(resolveConsoleOutput({ quiet: true })).toBe(true);
	});

	it("an explicit opt-in flag wins even in CI", () => {
		process.env.CI = "true";
		expect(resolveConsoleOutput({ log: "warn" })).toBe(true);
	});
});
