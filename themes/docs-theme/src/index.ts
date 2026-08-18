import { fileURLToPath } from "node:url";

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
