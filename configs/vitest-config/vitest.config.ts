import { defineConfig } from "vitest/config";

// Uses vitest directly rather than @theholocron/vitest-config to avoid
// a circular dependency (this package IS the vitest config).
export default defineConfig({
	test: {
		environment: "node",
		include: ["**/*.{test,spec}.{js,ts}"],
		exclude: ["**/node_modules/**", "**/dist/**"],
	},
});
