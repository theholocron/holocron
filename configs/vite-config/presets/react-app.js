import { mergeConfig } from "vite";
import { getPackageName } from "./get-package-name.js";

/**
 * Vite preset for React single-page applications.
 * Wires up @vitejs/plugin-react; accepts a vite-tsconfig-paths instance
 * via options.plugins if tsconfig path aliases are needed.
 * Uploads bundle stats to Codecov when CODECOV_TOKEN is set.
 *
 * @param {import('vite').UserConfig} [overrides={}]
 * @returns {Promise<import('vite').UserConfig>}
 */
export async function reactApp(overrides = {}) {
	const { default: react } = await import("@vitejs/plugin-react");

	const plugins = [react()];
	try {
		const { codecovVitePlugin } = await import("@codecov/vite-plugin");
		plugins.push(
			codecovVitePlugin({
				enableBundleAnalysis: !!process.env.CODECOV_TOKEN,
				bundleName: getPackageName(),
				uploadToken: process.env.CODECOV_TOKEN,
			}),
		);
	} catch {
		// @codecov/vite-plugin not installed — bundle analysis skipped
	}

	return mergeConfig(
		{
			plugins,
			build: {
				sourcemap: true,
			},
		},
		overrides,
	);
}
