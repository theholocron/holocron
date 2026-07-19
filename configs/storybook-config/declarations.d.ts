// Ambient stubs for optional peer dependencies that are not installed in
// devDependencies. These satisfy tsc --noEmit without requiring the full
// packages; tsdown uses its own resolver and compiles the real imports.

declare module "@storybook/addon-viewport" {
	export const INITIAL_VIEWPORTS: Record<string, unknown>;
}

declare module "msw-storybook-addon" {
	import type { LoaderFunction } from "@storybook/react";
	export const mswLoader: LoaderFunction;
	export function initialize(...args: unknown[]): void;
}

declare module "playwright" {
	export interface Page {
		[key: string]: unknown;
	}
}

declare module "axe-playwright" {
	export function injectAxe(page: unknown): Promise<void>;
	export function checkA11y(
		page: unknown,
		context?: unknown,
		options?: unknown,
	): Promise<void>;
}
