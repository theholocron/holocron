import { errorMessage } from "@theholocron/misc-utils";

import { loadRoleSyncProviders } from "../load-role-sync-providers/index.js";
import type { SyncTeamRolesResult } from "../sync-team-roles/index.js";
import { syncTeamRoles } from "../sync-team-roles/index.js";
import type { RunRoleSyncInput } from "./run-role-sync.type.js";

/**
 * Role sync for one `team.membership` or `organization.member-removed` delivery: loads the providers
 * (`loadRoleSyncProviders`), then runs the shared sync (`syncTeamRoles`). Never throws: a provider or network
 * error is a `fail` result, so a broken sync cannot turn the webhook response into a 500 that GitHub reports as
 * a failed delivery for something unrelated to receiving it. A deployment without role sync set up is `skipped`.
 */
export async function runRoleSync(input: RunRoleSyncInput): Promise<SyncTeamRolesResult> {
	try {
		const providers = await (input.loadProviders ?? loadRoleSyncProviders)({
			client: input.client,
			env: input.env,
			org: input.org,
		});
		if (!providers.ok) return { status: "skipped", reason: providers.reason };
		return await syncTeamRoles({
			notifications: providers.notifications,
			source: providers.source,
			org: input.org,
			...(input.team ? { team: input.team } : {}),
		});
	} catch (err) {
		return { status: "fail", reason: errorMessage(err) };
	}
}
