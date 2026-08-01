// Stub virtual modules that only exist inside an Astro project context.
// content.ts imports defineCollection from astro:content; docsSchema (from
// @astrojs/starlight/schema) imports SchemaContext. These stubs prevent
// cascade errors during standalone typecheck.
declare module "astro:content" {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export const defineCollection: any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type SchemaContext = any;
}
