// Stub virtual modules that only exist inside an Astro project context.
// TypeScript follows Starlight's .ts source files and hits these imports;
// the stubs prevent cascade errors during standalone typecheck.
declare module "astro:content" {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export const defineCollection: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export const getCollection: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type CollectionEntry<T extends string = string> = any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type RenderResult = any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type DataCollectionKey = any;
}

declare module "*?raw" {
	const content: string;
	export default content;
}
