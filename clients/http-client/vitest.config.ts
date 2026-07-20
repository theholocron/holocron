import base from "@theholocron/vitest-config/bundles/library";
import { defineConfig, mergeConfig } from "vitest/config";

// Exclude testing.ts from coverage — it is exercised by other packages, not here.
export default mergeConfig(
	base,
	defineConfig({
		test: { coverage: { exclude: ["src/testing.ts"] } },
	}),
);
