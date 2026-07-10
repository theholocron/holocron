import { mergeConfig } from "vite";

/**
 * Vite preset for Node.js CLI tools and server apps.
 * Targets Node 22, outputs a single ESM bundle, no browser polyfills.
 *
 * @param {object} options
 * @param {string} [options.entry='src/index.ts'] Application entry point
 * @param {import('vite').UserConfig} [options.overrides={}] Merged last
 * @returns {import('vite').UserConfig}
 */
export function nodeApp({ entry = "src/index.ts", overrides = {} } = {}) {
	return mergeConfig(
		{
			build: {
				target: "node22",
				lib: {
					entry,
					formats: ["es"],
					fileName: () => "index.mjs",
				},
				sourcemap: true,
				rollupOptions: {
					external: [/^node:/],
				},
			},
		},
		overrides,
	);
}
