import { fileURLToPath } from "node:url";

import type { StarlightPlugin } from "@astrojs/starlight/types";

const styles = fileURLToPath(new URL("./styles.css", import.meta.url));

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

export default docsTheme;
