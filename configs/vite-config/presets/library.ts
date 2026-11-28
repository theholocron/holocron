import { mergeConfig, type UserConfig } from "vite";

import { codecovToken } from "./codecov-token/index.js";
import { getPackageName } from "./get-package-name.js";

/**
 * Vite preset for publishable libraries.
 * Outputs ESM only; externalises React and react-dom by default.
 * Uploads bundle stats to Codecov when CODECOV_TOKEN is set.
 */
export async function library({
	entry = "src/index.ts",
	name,
	external = [],
	overrides = {},
}: {
	entry?: string;
	name?: string;
	external?: string[];
	overrides?: UserConfig;
} = {}): Promise<UserConfig> {
	const plugins = [];
	try {
		const { codecovVitePlugin } = await import("@codecov/vite-plugin");
		plugins.push(
			codecovVitePlugin({
				enableBundleAnalysis: !!codecovToken(),
				bundleName: getPackageName(),
				uploadToken: codecovToken(),
			})
		);
	} catch {
		// @codecov/vite-plugin not installed — bundle analysis skipped
	}

	return mergeConfig(
		{
			plugins,
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
		overrides
	);
}
