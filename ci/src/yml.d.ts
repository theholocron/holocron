declare module "*.yml" {
	const content: string;
	export default content;
}

interface ImportMeta {
	/** The bundler's glob import: every file matching `pattern`, by path, with its default export when `eager`. */
	glob<T>(pattern: string, options: { eager: true; import: "default" }): Record<string, T>;
}
