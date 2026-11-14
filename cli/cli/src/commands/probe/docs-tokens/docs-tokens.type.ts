import type { PluginToken } from "../../auth/index.js";

/** One plugin's `src/auth.ts`, as the docs-tokens probe reads it. */
export interface PluginAuthSource {
	/** The plugin's folder name, such as `holocron-plugin-github`. */
	plugin: string;
	/** The text of the plugin's `src/auth.ts`. */
	text: string;
}

/** The tokens one plugin declares (its `tokens` export), as the docs-tokens probe compares them with the page. */
export interface PluginTokenDeclaration {
	/** The plugin's folder name, such as `holocron-plugin-cloudflare`. */
	plugin: string;
	/** The plugin's `tokens` export; empty when it has none. */
	tokens: PluginToken[];
	/** Why the declaration could not be loaded, such as a plugin that is not built. */
	error?: string;
}

/** What the docs-tokens probe reads from the filesystem, so a test can supply all of it. */
export interface DocsTokensIo {
	/** The text of `docs/src/content/docs/tokens.mdx`. */
	page(): string;
	/** The `src/auth.ts` of every plugin that has one. */
	authFiles(): PluginAuthSource[];
	/** The `tokens` export of every plugin that has an `auth.ts`, loaded from the built plugin. */
	declarations(): Promise<PluginTokenDeclaration[]>;
	/** The text of the setup command's `run-setup.ts`, which builds one resolver itself. */
	setupSource(): string;
}
