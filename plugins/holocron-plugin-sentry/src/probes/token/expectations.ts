import type { PermissionRule, TokenExpectation } from "@theholocron/cli";

/** What the probe can read with a token, by the name its rows use: the organizations, the projects and the alert rules. */
export type Permission = "org" | "projects" | "alerts";

/** What a layer's token must do about a permission: `required` it must have it, `absent` it must not. */
export type Rule = PermissionRule;

const READS: Record<"org" | "projects", Rule> = { org: "required", projects: "required" };

/**
 * The general token provisions projects and their DSNs and lives on a laptop (`local` inherits `dev`): it needs
 * `org:read` and `project:read`. `project:write` has no read that proves it, so it is not probed; the permission table
 * in `docs/src/content/docs/tokens.mdx` lists it. This is the plugin's `tokens` declaration, read through
 * `tokenExpectations()`; change it and that table together.
 */
export const GENERAL: TokenExpectation = { permissions: { local: READS, dev: READS } };

const RELAY_READS: Record<Permission, Rule> = { org: "required", projects: "required", alerts: "required" };

/**
 * The Comlink relay's token makes an integration and an alert rule, so on top of the general token's reads it needs
 * `alerts:read`. Its write scopes (`org:write`, `alerts:write`) and `event:read` are not probed, as no read proves them.
 */
export const COMLINK: TokenExpectation = { permissions: { local: RELAY_READS, dev: RELAY_READS } };

/**
 * The release token only creates a release and uploads sourcemaps (an organization token with `org:ci`), so it must not
 * read the organization, its projects or its alert rules: a leak from CI cannot reach them.
 */
export const RELEASE: TokenExpectation = {
	permissions: { ci: { org: "absent", projects: "absent", alerts: "absent" } },
};
