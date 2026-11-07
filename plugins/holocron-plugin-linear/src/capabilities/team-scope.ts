import type { LinearTeam } from "@theholocron/linear-client";

import type { LinearClient } from "../rest.js";

/** The client and the team a capability works in. */
export interface TeamScope {
	/** The Linear client. */
	client: LinearClient;
	/** The configured team key, e.g. `ENG`. */
	teamKey: string;
	/** The team, looked up once. Throws when the token cannot see a team with that key. */
	team(): Promise<LinearTeam>;
}

/** Binds a client to a team key; the team is read on first use and kept. */
export function createTeamScope(client: LinearClient, teamKey: string): TeamScope {
	let found: Promise<LinearTeam> | undefined;
	return {
		client,
		teamKey,
		team: () =>
			(found ??= client.teams.find(teamKey).then((team) => {
				if (!team)
					throw new Error(
						`Linear team "${teamKey}" not found; check the \`team\` option and the token's access.`
					);
				return team;
			})),
	};
}
