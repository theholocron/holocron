/**
 * The closed list of area files `loadConfig` reads from `.holocron/` (the directory is `.<config name>`, set by kyber):
 * `.holocron/notifications.*` fills `providers.notifications`' `layout`, and `.holocron/repo.*` fills keys of `repo`.
 * A file not on this list is never read.
 */
export const HOLOCRON_AREAS = ["notifications", "repo"] as const;
