import type { SourceTeamMember } from "../../plugin/index.js";
import type { MemberLink } from "./links.js";

export interface RoleSyncPlan {
	/** Team members who are linked and do not hold the role: give it to them. */
	add: Array<{ member: string; login: string }>;
	/** Holders linked to a GitHub account that is no longer on the team: take it away. */
	remove: Array<{ member: string; login: string }>;
	/** Team members with no link: the role cannot reach them until they link their account. */
	unlinked: SourceTeamMember[];
	/** Holders with no link at all. Left alone, because nothing says they should not have it. */
	unknownHolders: Array<{ member: string; name?: string }>;
	/** Linked team members who already hold the role. */
	inSync: number;
}

/**
 * What it takes to make a role's holders equal a team, given who is linked to whom. Pure: it decides, the
 * caller acts. A holder is removed only when a link says they are a person who left the team; a holder
 * nobody has linked is reported, never removed, so an empty or missing links file cannot strip the role from
 * everyone.
 */
export function planRoleSync(input: {
	team: readonly SourceTeamMember[];
	links: readonly MemberLink[];
	holders: ReadonlyArray<{ id: string; name?: string }>;
}): RoleSyncPlan {
	const byGithub = new Map(input.links.map((l) => [l.github, l]));
	const byMember = new Map(input.links.map((l) => [l.member, l]));
	const onTeam = new Set(input.team.map((m) => m.id));
	const holding = new Set(input.holders.map((h) => h.id));

	const plan: RoleSyncPlan = { add: [], remove: [], unlinked: [], unknownHolders: [], inSync: 0 };
	for (const person of input.team) {
		const link = byGithub.get(person.id);
		if (!link) plan.unlinked.push(person);
		else if (holding.has(link.member)) plan.inSync++;
		else plan.add.push({ member: link.member, login: person.login });
	}
	for (const holder of input.holders) {
		const link = byMember.get(holder.id);
		if (!link) plan.unknownHolders.push({ member: holder.id, ...(holder.name ? { name: holder.name } : {}) });
		else if (!onTeam.has(link.github)) plan.remove.push({ member: holder.id, login: link.login });
	}
	return plan;
}

/**
 * The first role the layout declares for two different teams, or undefined. Names compare ignoring case, as
 * the server does; the role would be synced against one team and then the other, so the last would win.
 */
export function roleTeamProblem(layout: {
	roles?: ReadonlyArray<{ name: string; team?: string }>;
}): string | undefined {
	const seen = new Map<string, string>();
	for (const role of layout.roles ?? []) {
		if (!role.team) continue;
		const key = role.name.toLowerCase();
		const earlier = seen.get(key);
		if (earlier !== undefined && earlier.toLowerCase() !== role.team.toLowerCase()) {
			return `role \`${role.name}\` is declared for two teams (\`${earlier}\` and \`${role.team}\`); a role follows one team`;
		}
		seen.set(key, role.team);
	}
	return undefined;
}
