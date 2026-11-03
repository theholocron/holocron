import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_FACTORIES, loadRoleSyncProviders } from "./load-role-sync-providers.js";
import type { RoleNotifications, RoleSource, RoleSyncEnv, RoleSyncFactories } from "./load-role-sync-providers.type.js";

const CLIENT = {} as GitHubClient;
const ENV: RoleSyncEnv = {
	SENTINEL_ROLE_SYNC_REPO: "acme/holocron",
	HOLOCRON_DISCORD_BOT_TOKEN: "bot-token",
	HOLOCRON_USER_SYNC_TOKEN: "sync-token",
};
const NOTIFICATIONS = { providerName: "discord" } as unknown as RoleNotifications;
const SOURCE = { providerName: "github" } as unknown as RoleSource;

function factories(providers: unknown, status = "valid"): RoleSyncFactories {
	return {
		validateConfig: vi.fn(async () =>
			status === "valid"
				? { status: "valid" as const, filepath: "holocron.config.ts", config: { providers } as never }
				: ({ status } as never)
		),
		createNotifications: vi.fn(() => NOTIFICATIONS),
		createSource: vi.fn(() => SOURCE),
	};
}

const load = (env: RoleSyncEnv, f: RoleSyncFactories, org = "acme") =>
	loadRoleSyncProviders({ client: CLIENT, env, org, factories: f });

describe("loadRoleSyncProviders", () => {
	it("builds both providers from the configured repo's discord entry and the environment's tokens", async () => {
		const f = factories({ notifications: ["discord", { guildId: "1", layout: { roles: [] } }] });
		const result = await load(ENV, f);
		expect(result).toEqual({ ok: true, notifications: NOTIFICATIONS, source: SOURCE });
		expect(f.validateConfig).toHaveBeenCalledWith({ client: CLIENT, repo: "acme/holocron" });
		expect(f.createNotifications).toHaveBeenCalledWith({ guildId: "1", layout: { roles: [] } }, "bot-token");
		expect(f.createSource).toHaveBeenCalledWith(CLIENT, "sync-token", "acme/holocron");
	});

	it("finds the discord provider among several, whatever the org's case", async () => {
		const f = factories({ notifications: ["slack", ["discord", { guildId: "2" }]] });
		const result = await load(ENV, f, "ACME");
		expect(result.ok).toBe(true);
		expect(f.createNotifications).toHaveBeenCalledWith({ guildId: "2" }, "bot-token");
	});

	it("is off, saying which setting is missing, for each of the three", async () => {
		const f = factories({});
		for (const key of Object.keys(ENV) as Array<keyof RoleSyncEnv>) {
			const result = await load({ ...ENV, [key]: undefined }, f);
			expect(result).toMatchObject({ ok: false, reason: expect.stringContaining(key) });
		}
		expect(f.validateConfig).not.toHaveBeenCalled();
	});

	it("does nothing for an org other than the configured repo's", async () => {
		const f = factories({});
		const result = await load(ENV, f, "other");
		expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("not for the other organisation") });
		expect(f.validateConfig).not.toHaveBeenCalled();
	});

	it("says so when the config does not load", async () => {
		const result = await load(ENV, factories({}, "no-config"));
		expect(result).toEqual({ ok: false, reason: "acme/holocron has no usable holocron config (no-config)" });
	});

	it("says so when the config has no notifications provider, or none that is discord", async () => {
		expect(await load(ENV, factories(undefined))).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/no notifications/),
		});
		expect(await load(ENV, factories({}))).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/no notifications/),
		});
		expect(await load(ENV, factories({ notifications: ["slack"] }))).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/no discord/),
		});
	});
});

describe("DEFAULT_FACTORIES", () => {
	it("builds the Discord notifications capability with the layout from the config and no request", () => {
		const layout = { roles: [{ name: "gatekeepers", team: "gatekeepers" }] };
		const notifications = DEFAULT_FACTORIES.createNotifications({ guildId: "1", layout }, "bot-token");
		expect(notifications.providerName).toBe("discord");
		expect(notifications.layout).toEqual(layout);
	});

	it("builds a GitHub source that can list teams and read files", () => {
		const source = DEFAULT_FACTORIES.createSource(CLIENT, "sync-token", "acme/holocron");
		expect(source.providerName).toBe("github");
		expect(typeof source.teamMembers).toBe("function");
		expect(typeof source.readFile).toBe("function");
	});
});
