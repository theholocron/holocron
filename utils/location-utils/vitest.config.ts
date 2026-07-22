import { node } from "@theholocron/vitest-config";
import { defineConfig } from "vitest/config";

// location-utils uses browser APIs (navigator.geolocation) — no tests yet.
// Coverage disabled to avoid reporting 0% to codecov.
export default defineConfig({
	test: { ...node().test, globals: true, passWithNoTests: true },
});
