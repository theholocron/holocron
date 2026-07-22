import * as path from "node:path";
import { defineConfig } from "vite";

const NAME = "env-utils";

export default defineConfig({
	build: {
		lib: {
			entry: path.resolve(__dirname, "src/index.ts"),
			name: NAME,
			formats: ["es", "cjs"],
			fileName: (format) => `${NAME}.${format}.js`,
		},
		rollupOptions: {
			external: ["dotenv", "dotenv/config"],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		globals: true,
		environment: "node",
	},
});
