import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import type { RoleNotifications, RoleSource } from "../load-role-sync-providers/index.js";
import { runRoleSync } from "./run-role-sync.js";

const CLIENT = {} as GitHubClient;
const LINKS = JSON.stringify({ version: 1, links: [{ github: "1", login: "luke", member: "333" }] });

function providers() {
	const notifications = {
		providerName: "discord",
		layout: { roles: [{ name: "gatekeepers", team: "gatekeepers" }] },
		roleMembers: vi.fn(async () => []),
		addRoleMember: vi.fn(async () => {}),
		removeRoleMember: vi.fn(async () => {}),
	} as unknown as RoleNotifications;
	const source = {
		providerName: "github",
		teamMembers: vi.fn(async () => [{ id: "1", login: "luke" }]),
		readFile: vi.fn(async () => ({ content: LINKS, version: "v" })),
	} as unknown as RoleSource;
	return { notifications, source };
}

describe("runRoleSync", () => {
	it("loads the providers and syncs the team that changed", async () => {
		const p = providers();
		const loadProviders = vi.fn(async () => ({ ok: true as const, ...p }));
		const result = await runRoleSync({ client: CLIENT, env: {}, org: "acme", team: "gatekeepers", loadProviders });
		expect(loadProviders).toHaveBeenCalledWith({ client: CLIENT, env: {}, org: "acme" });
		expect(result).toMatchObject({ status: "synced", roles: ["gatekeepers"], added: 1 });
	});

	it("syncs every team when the delivery names none", async () => {
		const p = providers();
		const result = await runRoleSync({
			client: CLIENT,
			env: {},
			org: "acme",
			loadProviders: async () => ({ ok: true, ...p }),
		});
		expect(result).toMatchObject({ status: "synced" });
		expect(p.source.teamMembers).toHaveBeenCalledWith("gatekeepers", "acme");
	});

	it("is skipped, with the reason, when role sync is not set up", async () => {
		const result = await runRoleSync({
			client: CLIENT,
			env: {},
			org: "acme",
			loadProviders: async () => ({ ok: false, reason: "role sync is off" }),
		});
		expect(result).toEqual({ status: "skipped", reason: "role sync is off" });
	});

	it("turns a thrown error into a failed result instead of throwing", async () => {
		const result = await runRoleSync({
			client: CLIENT,
			env: {},
			org: "acme",
			loadProviders: async () => {
				throw new Error("GitHub is down");
			},
		});
		expect(result).toEqual({ status: "fail", reason: "GitHub is down" });
	});

	it("loads the real providers when none are injected (off without settings)", async () => {
		const result = await runRoleSync({ client: CLIENT, env: {}, org: "acme" });
		expect(result).toMatchObject({ status: "skipped", reason: expect.stringContaining("SENTINEL_ROLE_SYNC_REPO") });
	});
});
