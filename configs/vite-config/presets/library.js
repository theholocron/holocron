import { mergeConfig } from "vite";

/**
 * Vite preset for publishable libraries.
 * Outputs ESM only; externalises React and react-dom by default.
 *
 * @param {object} options
 * @param {string} [options.entry='src/index.ts'] Library entry point
 * @param {string} [options.name] UMD global name (required for UMD builds)
 * @param {string[]} [options.external=[]] Additional peer deps to externalise
 * @param {import('vite').UserConfig} [options.overrides={}] Merged last
 * @returns {import('vite').UserConfig}
 */
export function library({ entry = "src/index.ts", name, external = [], overrides = {} } = {}) {
	return mergeConfig(
		{
			build: {
				lib: {
					entry,
					name,
					formats: ["es"],
					fileName: () => "index.mjs",
				},
				rollupOptions: {
					external: ["react", "react-dom", ...external],
					output: {
						globals: {
							react: "React",
							"react-dom": "ReactDOM",
						},
					},
				},
				sourcemap: true,
			},
		},
		overrides,
	);
}
