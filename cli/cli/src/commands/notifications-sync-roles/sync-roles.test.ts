import { describe, expect, it, vi } from "vitest";

import type { Notifications, Source } from "../../plugin/index.js";
import type { LinksFile } from "./notifications-sync-roles.type.js";
import { syncRoles } from "./sync-roles.js";

const LINKS: LinksFile = {
	version: 1,
	links: [
		{ github: "1", login: "luke", member: "333" },
		{ github: "2", login: "leia", member: "444" },
	],
};

function fakeNotifications(over: Partial<Notifications> = {}): Notifications {
	return {
		key: "notifications",
		providerName: "discord",
		roleMembers: vi.fn(async () => [{ id: "444", name: "leia" }]),
		addRoleMember: vi.fn(async () => {}),
		removeRoleMember: vi.fn(async () => {}),
		...over,
	} as unknown as Notifications;
}

function fakeSource(over: Partial<Source> = {}): Source {
	return {
		key: "source",
		providerName: "github",
		teamMembers: vi.fn(async () => [{ id: "1", login: "luke" }]),
		...over,
	} as unknown as Source;
}

const ROLES = [{ name: "gatekeepers", team: "gatekeepers" }];

describe("syncRoles", () => {
	it("gives the role to a linked team member and takes it from one who left, saying nothing without print", async () => {
		const notifications = fakeNotifications();
		const result = await syncRoles({ notifications, source: fakeSource(), links: LINKS, roles: ROLES });
		expect(notifications.addRoleMember).toHaveBeenCalledWith("gatekeepers", "333");
		expect(notifications.removeRoleMember).toHaveBeenCalledWith("gatekeepers", "444");
		expect(result.ok).toBe(2);
		expect(result.failures).toEqual([]);
		expect(result.roles[0]).toMatchObject({ added: ["333"], removed: ["444"] });
	});

	it("asks the given organisation for the team, and the source's own when none is given", async () => {
		const source = fakeSource();
		await syncRoles({ notifications: fakeNotifications(), source, links: LINKS, roles: ROLES, org: "acme" });
		expect(source.teamMembers).toHaveBeenCalledWith("gatekeepers", "acme");
		await syncRoles({ notifications: fakeNotifications(), source, links: LINKS, roles: ROLES });
		expect(source.teamMembers).toHaveBeenLastCalledWith("gatekeepers", undefined);
	});

	it("changes nothing on a dry run and counts what it would have done as skipped", async () => {
		const notifications = fakeNotifications();
		const lines: string[] = [];
		const result = await syncRoles({
			notifications,
			source: fakeSource(),
			links: LINKS,
			roles: ROLES,
			dryRun: true,
			print: (l) => lines.push(l),
		});
		expect(notifications.addRoleMember).not.toHaveBeenCalled();
		expect(notifications.removeRoleMember).not.toHaveBeenCalled();
		expect(result).toMatchObject({ ok: 0, skipped: 2 });
		expect(lines.join("\n")).toMatch(/would give gatekeepers to luke/);
		expect(lines.join("\n")).toMatch(/would take gatekeepers from leia/);
		expect(lines.join("\n")).not.toMatch(/kept/);
	});

	it("gives but does not take with keep", async () => {
		const notifications = fakeNotifications();
		const lines: string[] = [];
		const result = await syncRoles({
			notifications,
			source: fakeSource(),
			links: LINKS,
			roles: ROLES,
			keep: true,
			print: (l) => lines.push(l),
		});
		expect(notifications.addRoleMember).toHaveBeenCalledTimes(1);
		expect(notifications.removeRoleMember).not.toHaveBeenCalled();
		expect(result).toMatchObject({ ok: 1, skipped: 1 });
		expect(lines.join("\n")).toMatch(/kept: --keep/);
	});

	it("records a plan that cannot be made and goes on to the next role", async () => {
		const roleMembers = vi
			.fn<NonNullable<Notifications["roleMembers"]>>()
			.mockRejectedValueOnce(new Error("no intent"))
			.mockResolvedValueOnce([]);
		const result = await syncRoles({
			notifications: fakeNotifications({ roleMembers }),
			source: fakeSource(),
			links: LINKS,
			roles: [...ROLES, { name: "maintainers", team: "maintainers" }],
		});
		expect(result.failures).toEqual([{ step: "role gatekeepers", message: expect.stringContaining("no intent") }]);
		expect(result.roles.map((r) => r.role)).toEqual(["maintainers"]);
	});

	it("records a failed add and a failed remove and carries on", async () => {
		const notifications = fakeNotifications({
			addRoleMember: vi.fn(async () => {
				throw new Error("missing permissions");
			}),
			removeRoleMember: vi.fn(async () => {
				throw new Error("hierarchy");
			}),
		});
		const result = await syncRoles({ notifications, source: fakeSource(), links: LINKS, roles: ROLES });
		expect(result.ok).toBe(0);
		expect(result.failures.map((f) => f.step)).toEqual([
			"role gatekeepers add luke",
			"role gatekeepers remove leia",
		]);
		expect(result.roles[0]).toMatchObject({ added: [], removed: [] });
	});

	it("lists an unlinked team member, a holder nobody linked, and those already in sync, leaving them alone", async () => {
		const notifications = fakeNotifications({
			roleMembers: vi.fn(async () => [{ id: "333" }, { id: "999", name: "stranger" }, { id: "888" }]),
		});
		const source = fakeSource({
			teamMembers: vi.fn(async () => [
				{ id: "1", login: "luke" },
				{ id: "7", login: "newbie" },
			]),
		});
		const lines: string[] = [];
		const result = await syncRoles({
			notifications,
			source,
			links: LINKS,
			roles: ROLES,
			print: (l) => lines.push(l),
		});
		const text = lines.join("\n");
		expect(text).toMatch(/1 already have it/);
		expect(text).toMatch(/newbie is on the team but has not linked/);
		expect(text).toMatch(/stranger holds gatekeepers but is not linked/);
		expect(text).toMatch(/888 holds gatekeepers but is not linked/);
		expect(result).toMatchObject({ ok: 0, skipped: 4 });
		expect(notifications.addRoleMember).not.toHaveBeenCalled();
		expect(notifications.removeRoleMember).not.toHaveBeenCalled();
	});
});
