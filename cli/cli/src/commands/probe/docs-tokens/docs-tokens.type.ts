/** One plugin's `src/auth.ts`, as the docs-tokens probe reads it. */
export interface PluginAuthSource {
	/** The plugin's folder name, such as `holocron-plugin-github`. */
	plugin: string;
	/** The text of the plugin's `src/auth.ts`. */
	text: string;
}

/** What the docs-tokens probe reads from the filesystem, so a test can supply all of it. */
export interface DocsTokensIo {
	/** The text of `docs/src/content/docs/tokens.mdx`. */
	page(): string;
	/** The `src/auth.ts` of every plugin that has one. */
	authFiles(): PluginAuthSource[];
	/** The text of the setup command's `run-setup.ts`, which builds one resolver itself. */
	setupSource(): string;
}
