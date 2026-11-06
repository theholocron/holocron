import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DocsTokensIo } from "./docs-tokens.type.js";

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
		setupSource: () => readFileSync(join(repoRoot, "cli/cli/src/commands/setup/run-setup.ts"), "utf8"),
	};
	/* v8 ignore stop */
}
