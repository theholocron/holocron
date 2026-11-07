import { describe, expect, it } from "vitest";

import type { ServerInspection } from "../../plugin/index.js";
import { botPermissionChecks } from "./bot-permission-checks.js";

const server = (over: Partial<ServerInspection> = {}): ServerInspection => ({
	categories: [],
	channels: [],
	roles: [],
	...over,
});

describe("botPermissionChecks", () => {
	it("adds no row when the provider reports nothing about its bot", () => {
		expect(botPermissionChecks({ found: server() })).toEqual([]);
	});

	it("passes when nothing is missing, as for the owner or an Administrator", () => {
		const [row] = botPermissionChecks({ found: server({ botPermissions: { missing: [] } }) });
		expect(row).toMatchObject({ id: "bot-permissions", status: "pass", problems: [] });
	});

	it("fails naming what is missing and carries the invite link", () => {
		const link = "https://discord.com/oauth2/authorize?client_id=1&permissions=2";
		const [row] = botPermissionChecks({
			found: server({ botPermissions: { missing: ["Manage Threads", "Pin Messages"], inviteUrl: link } }),
		});
		expect(row?.status).toBe("fail");
		expect(row?.problems).toEqual([
			"missing: Manage Threads, Pin Messages",
			`invite the bot again with them (updates its role in place): ${link}`,
		]);
	});

	it("fails with just the names when the provider could not build a link", () => {
		const [row] = botPermissionChecks({ found: server({ botPermissions: { missing: ["Add Reactions"] } }) });
		expect(row?.status).toBe("fail");
		expect(row?.problems).toEqual(["missing: Add Reactions"]);
	});

	it("skips, with the reason, when the bot's roles could not be read", () => {
		const [row] = botPermissionChecks({ found: server({ botPermissionsError: "Missing Access" }) });
		expect(row).toMatchObject({ status: "skip" });
		expect(row?.detail).toContain("could not read the bot's roles (Missing Access)");
	});

	it("skips when the server could not be read at all", () => {
		const [row] = botPermissionChecks({ found: undefined });
		expect(row).toMatchObject({ status: "skip", detail: "not checked: could not read the server" });
	});
});
