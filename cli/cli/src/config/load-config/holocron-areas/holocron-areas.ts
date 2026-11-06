/**
 * The closed list of area files `loadConfig` reads from `.holocron/` (the directory is `.<config name>`, set by kyber):
 * `.holocron/notifications.*` fills `providers.notifications`' `layout`, `.holocron/repo.*` fills keys of `repo`, and `.holocron/org.*` fills provider options (`teamId`, `accountId`) a config leaves out.
 * A file not on this list is never read.
 */
export const HOLOCRON_AREAS = ["notifications", "repo", "org"] as const;
