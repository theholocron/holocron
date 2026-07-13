import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

export default defineConfig(
	library({
		thresholds: {
			// defaultSpawn fallback (`?? spawnSync`) is untestable without a live `op` binary
			"src/auth.ts": { lines: 80, functions: 80, branches: 50, statements: 80 },
			"src/verify-token.ts": { lines: 80, functions: 80, branches: 50, statements: 80 },
		},
	})
);
