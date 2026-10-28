import { describe, expect, it } from "vitest";

import {
	detectEnv,
	generateRunId,
	isCI,
	isTelemetryDisabled,
	parseLogLevel,
	resolveAxiomFromEnv,
	resolveLevel,
} from "./context.js";

describe("generateRunId", () => {
	it("returns a v4 UUID", () => {
		expect(generateRunId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});

	it("returns a different id each call", () => {
		expect(generateRunId()).not.toBe(generateRunId());
	});
});

describe("isCI", () => {
	it("is false when CI is unset", () => {
		expect(isCI({})).toBe(false);
	});

	it("is false when CI is an explicit falsy string", () => {
		expect(isCI({ CI: "false" })).toBe(false);
		expect(isCI({ CI: "0" })).toBe(false);
	});

	it("is true for CI=true and other truthy values", () => {
		expect(isCI({ CI: "true" })).toBe(true);
		expect(isCI({ CI: "1" })).toBe(true);
	});
});

describe("detectEnv", () => {
	it("maps CI presence to ci/local", () => {
		expect(detectEnv({ CI: "true" })).toBe("ci");
		expect(detectEnv({})).toBe("local");
	});
});

describe("parseLogLevel", () => {
	it("accepts the four known levels", () => {
		for (const level of ["debug", "info", "warn", "error"] as const) {
			expect(parseLogLevel(level)).toBe(level);
		}
	});

	it("rejects anything else", () => {
		expect(parseLogLevel("trace")).toBeUndefined();
		expect(parseLogLevel("")).toBeUndefined();
		expect(parseLogLevel(undefined)).toBeUndefined();
	});
});

describe("resolveLevel", () => {
	it("prefers the explicit level over env and default", () => {
		expect(resolveLevel("warn", { HOLOCRON_LOG_LEVEL: "debug" })).toBe("warn");
	});

	it("falls back to HOLOCRON_LOG_LEVEL when no explicit level", () => {
		expect(resolveLevel(undefined, { HOLOCRON_LOG_LEVEL: "debug" })).toBe("debug");
	});

	it("ignores an unrecognised env value and falls through to the default", () => {
		expect(resolveLevel(undefined, { HOLOCRON_LOG_LEVEL: "loud" })).toBe("info");
	});

	it("defaults to info", () => {
		expect(resolveLevel(undefined, {})).toBe("info");
	});
});

describe("isTelemetryDisabled", () => {
	it("is true only for the exact string 'false'", () => {
		expect(isTelemetryDisabled({ HOLOCRON_TELEMETRY: "false" })).toBe(true);
		expect(isTelemetryDisabled({ HOLOCRON_TELEMETRY: "true" })).toBe(false);
		expect(isTelemetryDisabled({})).toBe(false);
	});
});

describe("resolveAxiomFromEnv", () => {
	it("returns the credentials when both token and dataset are present", () => {
		expect(resolveAxiomFromEnv({ HOLOCRON_AXIOM_TOKEN: "xaat-t", HOLOCRON_AXIOM_DATASET: "holocron-ci" })).toEqual({
			token: "xaat-t",
			dataset: "holocron-ci",
		});
	});

	it("falls back to the vendor-native env vars", () => {
		expect(resolveAxiomFromEnv({ AXIOM_TOKEN: "t", AXIOM_DATASET: "d" })).toEqual({ token: "t", dataset: "d" });
	});

	it("prefers the HOLOCRON_-prefixed vars over the vendor-native ones", () => {
		expect(
			resolveAxiomFromEnv({
				HOLOCRON_AXIOM_TOKEN: "hlc",
				AXIOM_TOKEN: "vendor",
				HOLOCRON_AXIOM_DATASET: "hlc-ds",
				AXIOM_DATASET: "vendor-ds",
			})
		).toEqual({ token: "hlc", dataset: "hlc-ds" });
	});

	it("returns undefined unless BOTH a token and a dataset are set", () => {
		expect(resolveAxiomFromEnv({ HOLOCRON_AXIOM_TOKEN: "t" })).toBeUndefined();
		expect(resolveAxiomFromEnv({ HOLOCRON_AXIOM_DATASET: "d" })).toBeUndefined();
		expect(resolveAxiomFromEnv({})).toBeUndefined();
	});
});
