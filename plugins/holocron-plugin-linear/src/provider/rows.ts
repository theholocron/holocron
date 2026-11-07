import type { ProviderRow } from "@theholocron/cli";
import type { LinearProject } from "@theholocron/linear-client";

import type { TeamScope } from "../capabilities/team-scope.js";

/** One row of a provider step. `problems` is for a failure: a line per thing that is wrong, or the fix. */
export function row(
	id: string,
	title: string,
	status: ProviderRow["status"],
	detail: string,
	problems: string[] = []
): ProviderRow {
	return { id, title, status, detail, problems };
}

/** The message of a thrown value. */
export const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** What a failed write most likely means when the key cannot change team settings. */
const NEEDS_ADMIN = /forbidden|permission|not authori[sz]ed|admin|access/i;

/** A failed step as a row; a message about permissions also says which key is needed. */
export function failure(id: string, title: string, err: unknown): ProviderRow {
	const message = messageOf(err);
	return row(
		id,
		title,
		"fail",
		message,
		NEEDS_ADMIN.test(message) ? ["needs a Linear key with write access to the team (admin for team settings)"] : []
	);
}

/** The open project of the team with exactly this name. */
export async function findProject(scope: TeamScope, name: string): Promise<LinearProject | undefined> {
	const team = await scope.team();
	const all = await scope.client.projects.list();
	return all.find((p) => p.archivedAt === null && p.name === name && p.teams.nodes.some((t) => t.id === team.id));
}
