/**
 * What `@theholocron/cli` exposes of `sync roles`: the sync itself and the checks in front of it,
 * so another adapter (Sentinel's hosted role sync) runs the same function the command does.
 */
export { readLinks, sourceProblem } from "./notifications-sync-roles.js";
export type { LinksFile, MemberLink, SyncRolesInput, SyncRolesResult } from "./notifications-sync-roles.type.js";
export { roleTeamProblem } from "./plan.js";
export { syncRoles } from "./sync-roles.js";
