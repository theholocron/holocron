import { coverageConfigDefaults } from "vitest/config";

export const coverage = {
	all: false,
	exclude: [...coverageConfigDefaults.exclude] as string[],
	provider: "v8" as const,
	reporter: ["text", "lcov"] as string[],
};
