import type { PermissionRule, TokenExpectation } from "@theholocron/cli";

/** A permission the probe tries, by the name its rows use. */
export type Permission = "zone" | "dns" | "routes" | "scripts" | "pages" | "tunnels";

/** What a layer's token must do about a permission: `required` it must have it, `absent` it must not. */
export type Rule = PermissionRule;

const EVERYTHING: Record<Permission, Rule> = {
	zone: "required",
	dns: "required",
	routes: "required",
	scripts: "required",
	pages: "required",
	tunnels: "required",
};

/**
 * What each layer's Cloudflare token is meant to carry, the same as "What each Cloudflare token needs" in
 * `docs/src/content/docs/tokens.mdx`: a laptop (`local` inherits `dev`) runs everything, CI only deploys Pages, so a
 * leak from CI cannot change DNS, Workers or a tunnel. A layer not listed (`prod`) has no declared expectations and its
 * token is only reported. This is the plugin's `tokens` declaration, read through `tokenExpectations()`; change it and
 * that table together.
 */
export const EXPECTED: TokenExpectation = {
	permissions: {
		local: EVERYTHING,
		dev: EVERYTHING,
		ci: {
			zone: "absent",
			dns: "absent",
			routes: "absent",
			scripts: "absent",
			pages: "required",
			tunnels: "absent",
		},
	},
};
