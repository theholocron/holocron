/**
 * The closed list of area files `loadConfig` reads from `.holocron/` (the directory is `.<config name>`, set by kyber):
 * `.holocron/notifications.*` fills `providers.notifications`' `layout`, `.holocron/repo.*` fills keys of `repo`, and `.holocron/org.*` fills provider options (`teamId`, `accountId`) a config leaves out.
 * A file not on this list is never read.
 */
export const HOLOCRON_AREAS = ["notifications", "repo", "org"] as const;

/**
 * The areas a config in a subdirectory also reads from the repository root's `.holocron/` (SPEC-0069): only `org`,
 * because its values are the organization's and every config needs them. `repo` and `notifications` describe the
 * repository itself, so an app's config does not take them from the root.
 */
export const SHARED_AREAS = ["org"] as const;
