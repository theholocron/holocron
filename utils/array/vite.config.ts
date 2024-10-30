import * as path from "node:path";
import { defineConfig } from "vite";

/*
 * @see https://vitejs.dev/config/
 */
export default defineConfig({
	plugins: [],
	build: {
		lib: {
			entry: path.resolve(__dirname, "src/index.ts"), // Entry point of your library
			name: "utils-array",
			formats: ["es", "cjs"], // Specify formats (ESM and CommonJS)
			fileName: (format) => `utils-array.${format}.js`,
		},
		rollupOptions: {
			external: [], // Externalize any specific Node dependencies
			output: {
				globals: {
					// Define globals for any externalized dependencies
				},
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"), // Adjust as needed
		},
	},
	test: {
		globals: true,
		environment: "node", // Use Node environment for testing
	},
});
