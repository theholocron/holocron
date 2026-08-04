import { mergeConfig, type UserConfig } from "vite";
import { getPackageName } from "./get-package-name.js";

/**
 * Vite preset for publishable React component libraries.
 * Outputs ESM + CJS; externalises React and react-dom; wires up
 * @vitejs/plugin-react and optional Codecov bundle analysis.
 */
export async function reactLibrary({
	entry = "src/index.ts",
	name,
	formats = ["es", "cjs"] as ("es" | "cjs" | "umd" | "iife")[],
	external = [] as string[],
	overrides = {} as UserConfig,
}: {
	entry?: string;
	name?: string;
	formats?: ("es" | "cjs" | "umd" | "iife")[];
	external?: string[];
	overrides?: UserConfig;
} = {}): Promise<UserConfig> {
	const resolvedName = name ?? getPackageName();

	const { default: react } = await import("@vitejs/plugin-react");

	const plugins: NonNullable<UserConfig["plugins"]> = [react()];
	try {
		const { codecovVitePlugin } = await import("@codecov/vite-plugin");
		plugins.push(
			codecovVitePlugin({
				enableBundleAnalysis: !!process.env.CODECOV_TOKEN,
				bundleName: resolvedName,
				uploadToken: process.env.CODECOV_TOKEN,
			}) as never
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
					name: resolvedName,
					formats,
					fileName: (format: string) => `${resolvedName}.${format}.js`,
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
