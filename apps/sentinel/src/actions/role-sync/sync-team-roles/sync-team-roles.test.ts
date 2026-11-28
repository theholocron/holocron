import { describe, expect, it, vi } from "vitest";

import type { RoleNotifications, RoleSource } from "../load-role-sync-providers/index.js";
import { syncTeamRoles } from "./sync-team-roles.js";

const LINKS = JSON.stringify({
	version: 1,
	links: [
		{ github: "1", login: "luke", member: "333" },
		{ github: "2", login: "leia", member: "444" },
	],
});

function notifications(over: Record<string, unknown> = {}, roles?: unknown): RoleNotifications {
	return {
		key: "notifications",
		providerName: "discord",
		layout: {
			roles: roles ?? [
				{ name: "gatekeepers", team: "gatekeepers" },
				{ name: "maintainers", team: "maintainers" },
				{ name: "everyone-else" },
			],
		},
		roleMembers: vi.fn(async () => [{ id: "444" }]),
		addRoleMember: vi.fn(async () => {}),
		removeRoleMember: vi.fn(async () => {}),
		...over,
	} as unknown as RoleNotifications;
}

function source(over: Record<string, unknown> = {}): RoleSource {
	return {
		key: "source",
		providerName: "github",
		teamMembers: vi.fn(async () => [{ id: "1", login: "luke" }]),
		readFile: vi.fn(async () => ({ content: LINKS, version: "v" })),
		...over,
	} as unknown as RoleSource;
}

describe("syncTeamRoles", () => {
	it("syncs only the roles that follow the team that changed, in the org", async () => {
		const n = notifications();
		const s = source();
		const result = await syncTeamRoles({ notifications: n, source: s, org: "acme", team: "Gatekeepers" });
		expect(result).toEqual({
			status: "synced",
			roles: ["gatekeepers"],
			added: 1,
			removed: 1,
			failures: [],
		});
		expect(s.teamMembers).toHaveBeenCalledTimes(1);
		expect(s.teamMembers).toHaveBeenCalledWith("gatekeepers", "acme");
		expect(n.addRoleMember).toHaveBeenCalledWith("gatekeepers", "333");
		expect(n.removeRoleMember).toHaveBeenCalledWith("gatekeepers", "444");
	});

	it("syncs every role that follows a team when no team is given, reading the links file in the org", async () => {
		const s = source();
		const result = await syncTeamRoles({ notifications: notifications(), source: s, org: "acme" });
		expect(result).toMatchObject({ status: "synced", roles: ["gatekeepers", "maintainers"] });
		expect(s.readFile).toHaveBeenCalledWith("notifications/discord-links.json", "acme/.github-private");
	});

	it("is partial, listing each failure, when a step fails", async () => {
		const n = notifications({
			addRoleMember: vi.fn(async () => {
				throw new Error("missing permissions");
			}),
		});
		const result = await syncTeamRoles({ notifications: n, source: source(), org: "acme", team: "gatekeepers" });
		expect(result).toMatchObject({ status: "partial", added: 0, removed: 1 });
		expect((result as { failures: string[] }).failures).toEqual([
			expect.stringContaining("role gatekeepers add luke: "),
		]);
	});

	it("skips a provider that cannot manage roles", async () => {
		for (const missing of ["roleMembers", "addRoleMember", "removeRoleMember"]) {
			const result = await syncTeamRoles({
				notifications: notifications({ [missing]: undefined }),
				source: source(),
				org: "acme",
			});
			expect(result).toEqual({ status: "skipped", reason: "the discord provider cannot manage role members" });
		}
	});

	it("skips when no role follows the team, or any team", async () => {
		expect(
			await syncTeamRoles({ notifications: notifications(), source: source(), org: "acme", team: "triage" })
		).toEqual({ status: "skipped", reason: "no role follows the triage team" });
		expect(
			await syncTeamRoles({ notifications: notifications({}, [{ name: "a" }]), source: source(), org: "acme" })
		).toEqual({ status: "skipped", reason: "no role declares a team" });
		expect(
			await syncTeamRoles({ notifications: notifications({ layout: undefined }), source: source(), org: "acme" })
		).toEqual({ status: "skipped", reason: "no role declares a team" });
	});

	it("fails on a role declared for two teams", async () => {
		const n = notifications({}, [
			{ name: "gatekeepers", team: "a" },
			{ name: "Gatekeepers", team: "b" },
		]);
		const result = await syncTeamRoles({ notifications: n, source: source(), org: "acme" });
		expect(result).toMatchObject({ status: "fail", reason: expect.stringContaining("declared for two teams") });
	});

	it("fails when the source cannot list teams or read files", async () => {
		const result = await syncTeamRoles({
			notifications: notifications(),
			source: source({ teamMembers: undefined }),
			org: "acme",
		});
		expect(result).toMatchObject({ status: "fail", reason: expect.stringContaining("cannot list team members") });
	});

	it("fails, and changes nothing, when the links file is damaged", async () => {
		const n = notifications();
		const result = await syncTeamRoles({
			notifications: n,
			source: source({ readFile: vi.fn(async () => ({ content: "not json", version: "v" })) }),
			org: "acme",
		});
		expect(result).toMatchObject({ status: "fail", reason: expect.stringContaining("not valid JSON") });
		expect(n.addRoleMember).not.toHaveBeenCalled();
		expect(n.removeRoleMember).not.toHaveBeenCalled();
	});
});
