import { defineConfig } from "vitest/config";
import { node } from "@theholocron/vitest-config/node";

const base = node();

export default defineConfig({
	...base,
	test: {
		...base.test,
		coverage: {
			enabled: true,
			provider: "v8",
			reporter: ["lcov", "text"],
			// src/index.ts is the implementation file (not a re-export barrel), include it.
			include: ["src/**/*.ts"],
			exclude: ["src/**/__tests__/**", "src/**/*.{test,spec}.ts", "**/node_modules/**", "**/dist/**"],
			thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
		},
	},
});
