import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

export default defineConfig(
	library({
		test: { passWithNoTests: false },
	}) as never
);
