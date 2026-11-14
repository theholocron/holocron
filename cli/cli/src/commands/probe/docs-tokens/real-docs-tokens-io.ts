import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createDefaultImporter } from "../../auth/index.js";
import type { DocsTokensIo, PluginTokenDeclaration } from "./docs-tokens.type.js";

/** The docs-tokens probe's inputs from the real files of `repoRoot`. */
export function realDocsTokensIo(repoRoot: string): DocsTokensIo {
	/* v8 ignore start -- reads real files; the probe is tested with an injected io */
	return {
		page: () => readFileSync(join(repoRoot, "docs/src/content/docs/tokens.mdx"), "utf8"),
		authFiles: () =>
			readdirSync(join(repoRoot, "plugins"))
				.map((plugin) => ({ plugin, file: join(repoRoot, "plugins", plugin, "src/auth.ts") }))
				.filter(({ file }) => existsSync(file))
				.map(({ plugin, file }) => ({ plugin, text: readFileSync(file, "utf8") })),
		declarations: async () => {
			const importer = createDefaultImporter(repoRoot);
			const plugins = readdirSync(join(repoRoot, "plugins")).filter((plugin) =>
				existsSync(join(repoRoot, "plugins", plugin, "src/auth.ts"))
			);
			return Promise.all(
				plugins.map(async (plugin): Promise<PluginTokenDeclaration> => {
					try {
						return { plugin, tokens: (await importer(`@theholocron/${plugin}`)).tokens ?? [] };
					} catch (error) {
						return { plugin, tokens: [], error: error instanceof Error ? error.message : String(error) };
					}
				})
			);
		},
		setupSource: () => readFileSync(join(repoRoot, "cli/cli/src/commands/setup/run-setup.ts"), "utf8"),
	};
	/* v8 ignore stop */
}
