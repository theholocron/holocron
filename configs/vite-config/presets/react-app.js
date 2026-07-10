import { mergeConfig } from "vite";

/**
 * Vite preset for React single-page applications.
 * Wires up @vitejs/plugin-react; accepts a vite-tsconfig-paths instance
 * via options.plugins if tsconfig path aliases are needed.
 *
 * @param {import('vite').UserConfig} [overrides={}]
 * @returns {Promise<import('vite').UserConfig>}
 */
export async function reactApp(overrides = {}) {
	const { default: react } = await import("@vitejs/plugin-react");

	return mergeConfig(
		{
			plugins: [react()],
			build: {
				sourcemap: true,
			},
		},
		overrides,
	);
}
