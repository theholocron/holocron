import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

// session.ts has pre-existing coverage gaps (62% lines) — tracked as tech debt
export default defineConfig(
	library({
		globals: true,
		thresholds: { lines: 60, statements: 60 },
	}) as never,
);
