import { fileURLToPath } from "node:url";

// tsdown does not process CSS: the `delivery.build` script copies src/styles.css to dist/ (see package.json), and this
// resolves to dist/styles.css after the build. Changing the copy step breaks consumers without failing the TypeScript
// build. A package that ships CSS also lists `"sideEffects": ["*.css"]` in its package.json.
const styles = fileURLToPath(new URL("./styles.css", import.meta.url));

interface SetupOptions {
	config: { customCss?: string[] };
	updateConfig(newConfig: { customCss: string[] }): void;
	[key: string]: unknown;
}

interface StarlightPlugin {
	name: string;
	hooks: {
		setup(options: SetupOptions): void | Promise<void>;
	};
}

export function docsTheme(): StarlightPlugin {
	return {
		name: "@theholocron/docs-theme",
		hooks: {
			setup({ config, updateConfig }) {
				updateConfig({
					customCss: [styles, ...(config.customCss ?? [])],
				});
			},
		},
	};
}
