import { describe, expect, it } from "vitest";

import { planRoleSync, roleTeamProblem } from "./plan.js";

const links = [
	{ github: "1", login: "luke", member: "333" },
	{ github: "2", login: "leia", member: "444" },
	{ github: "3", login: "han", member: "555" },
];

describe("planRoleSync", () => {
	it("gives the role to linked team members who lack it", () => {
		const plan = planRoleSync({ team: [{ id: "1", login: "luke" }], links, holders: [] });
		expect(plan.add).toEqual([{ member: "333", login: "luke" }]);
		expect(plan.remove).toEqual([]);
	});

	it("counts those already holding it as in sync", () => {
		const plan = planRoleSync({ team: [{ id: "1", login: "luke" }], links, holders: [{ id: "333" }] });
		expect(plan).toMatchObject({ add: [], remove: [], inSync: 1 });
	});

	it("takes the role from a linked holder whose GitHub account left the team", () => {
		const plan = planRoleSync({
			team: [{ id: "1", login: "luke" }],
			links,
			holders: [{ id: "333" }, { id: "444" }],
		});
		expect(plan.remove).toEqual([{ member: "444", login: "leia" }]);
	});

	it("lists team members nobody has linked, and does not touch holders nobody has linked", () => {
		const plan = planRoleSync({
			team: [{ id: "9", login: "new" }],
			links,
			holders: [{ id: "999", name: "stranger" }],
		});
		expect(plan.unlinked).toEqual([{ id: "9", login: "new" }]);
		expect(plan.unknownHolders).toEqual([{ member: "999", name: "stranger" }]);
		expect(plan.remove).toEqual([]);
	});

	it("an empty links file removes nobody", () => {
		const plan = planRoleSync({
			team: [{ id: "1", login: "luke" }],
			links: [],
			holders: [{ id: "333" }, { id: "444" }],
		});
		expect(plan.remove).toEqual([]);
		expect(plan.unknownHolders).toHaveLength(2);
		expect(plan.unlinked).toHaveLength(1);
	});

	it("matches people by id, so a renamed login does not matter", () => {
		const plan = planRoleSync({ team: [{ id: "1", login: "skywalker" }], links, holders: [{ id: "333" }] });
		expect(plan.inSync).toBe(1);
	});

	it("leaves a holder without a name unnamed", () => {
		expect(planRoleSync({ team: [], links: [], holders: [{ id: "9" }] }).unknownHolders).toEqual([{ member: "9" }]);
	});
});

describe("roleTeamProblem", () => {
	it("refuses one role name declared for two teams, ignoring case", () => {
		expect(
			roleTeamProblem({
				roles: [
					{ name: "Gatekeepers", team: "a" },
					{ name: "gatekeepers", team: "b" },
				],
			})
		).toMatch(/declared for two teams/);
	});
	it("accepts the same team twice, roles without a team, and different roles", () => {
		expect(
			roleTeamProblem({
				roles: [{ name: "x", team: "a" }, { name: "X", team: "A" }, { name: "y" }, { name: "z", team: "b" }],
			})
		).toBeUndefined();
		expect(roleTeamProblem({})).toBeUndefined();
	});
});
