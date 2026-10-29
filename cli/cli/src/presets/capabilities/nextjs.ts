import type { Capability } from "../../config/compose/index.js";
import { react } from "./react.js";

export interface NextjsOptions {
	/** Extra `with:` inputs merged into the `test` workflow entry. */
	test?: Record<string, unknown>;
}

/**
 * Bundle preset for Next.js application repos. Returns a Capability[] that
 * includes react() so callers only need compose(node(), typecheck(), nextjs()).
 * compose() deduplicates, so adding react() explicitly is harmless.
 *
 * Adds: Vercel deployment and Cypress user-flow tests on top of react().
 * Requires (via react()): node, typecheck
 *
 * @example
 * const preset = compose(node(), typecheck(), nextjs({ test: { "wait-on-url": "http://localhost:3000" } }));
 */
export function nextjs({ test: testOverrides = {} }: NextjsOptions = {}): Capability[] {
	const nextjsCapability: Capability = {
		id: "nextjs",
		requires: ["react"],
		org: "theholocron",
		domain: "theholocron.dev",
		providers: { deployment: "vercel" },
		tasks: [
			{
				name: "test",
				with: {
					"run-unit": false,
					"run-storybook": true,
					"run-interaction": true,
					"run-user-flow": true,
					...testOverrides,
				},
			},
		],
	};

	return [react(), nextjsCapability];
}
