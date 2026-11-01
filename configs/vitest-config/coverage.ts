import { coverageConfigDefaults } from "vitest/config";

/** Default Vitest coverage options: the V8 provider with text and lcov reports. */
export const coverage = {
	/** Off, so only files loaded by tests are counted in coverage. */
	all: false,
	/** Paths excluded from coverage, starting from Vitest's own defaults. */
	exclude: [...coverageConfigDefaults.exclude] as string[],
	/** The coverage provider: V8's built-in coverage. */
	provider: "v8" as const,
	/** The report formats: a terminal `text` table and an `lcov` file. */
	reporter: ["text", "lcov"] as string[],
};
