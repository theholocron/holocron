import { mergeConfig, type UserConfig } from "vite";

import { codecovToken } from "./codecov-token/index.js";
import { getPackageName } from "./get-package-name.js";

/**
 * Vite preset for React single-page applications.
 * Wires up @vitejs/plugin-react; accepts a vite-tsconfig-paths instance
 * via options.plugins if tsconfig path aliases are needed.
 * Uploads bundle stats to Codecov when CODECOV_TOKEN is set.
 */
export async function reactApp(overrides: UserConfig = {}): Promise<UserConfig> {
	const { default: react } = await import("@vitejs/plugin-react");

	const plugins: NonNullable<UserConfig["plugins"]> = [react()];
	try {
		const { codecovVitePlugin } = await import("@codecov/vite-plugin");
		plugins.push(
			codecovVitePlugin({
				enableBundleAnalysis: !!codecovToken(),
				bundleName: getPackageName(),
				uploadToken: codecovToken(),
			}) as never
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
		overrides
	);
}
